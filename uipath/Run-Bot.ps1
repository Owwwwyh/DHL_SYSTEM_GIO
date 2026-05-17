# =====================================================================
#  DHL Knowledge Base, UiPath ingestion bot
#  Folder-watcher implementation, callable from UiPath Studio
#  or runnable directly with PowerShell.
#
#  USAGE
#    .\Run-Bot.ps1                          # uses defaults below
#    .\Run-Bot.ps1 -InboxPath "F:\DHL_Inbox" -BaseUrl "https://..." -ApiKey "..."
#
#  WHAT IT DOES (per file in InboxPath)
#    1. POST /api/duplicate-check  (with SHA256 of file body)
#    2. If duplicate, log SKIP and move on
#    3. POST /api/ingest           (multipart, file attached)
#    4. POST /api/process          (Gemini extraction)
#    5. POST /api/articles/:id/status   { status: reviewed }
#    6. Move file to ./processed
#    7. On any error, screenshot the desktop + append errors.csv
#    8. After all files, POST /api/summary-report  (emails admin)
# =====================================================================

param(
  [string]$InboxPath  = "F:\DHL_Inbox",
  [string]$BaseUrl    = "https://dhl-system-gio.vercel.app",
  [string]$ApiKey     = "dhl-uipath-secret-2024",
  [string]$AdminEmail = "admin@dhl.com",
  [switch]$AutoPromote
)

$ErrorActionPreference = "Stop"
$processedDir   = Join-Path $InboxPath "processed"
$logsDir        = Join-Path $InboxPath "logs"
$screenshotDir  = Join-Path $logsDir "screenshots"
$runLog         = Join-Path $logsDir ("run-" + (Get-Date -f "yyyyMMdd") + ".txt")
$errorsCsv      = Join-Path $logsDir "errors.csv"

New-Item -ItemType Directory -Force -Path $processedDir, $logsDir, $screenshotDir | Out-Null
if (-not (Test-Path $errorsCsv)) {
  "timestamp,file,http_code,error_message" | Out-File $errorsCsv -Encoding utf8
}

function Write-Log {
  param([string]$Level, [string]$Message)
  $line = "[{0}] [{1}] {2}" -f (Get-Date -f "u"), $Level, $Message
  Write-Host $line
  $line | Out-File $runLog -Append -Encoding utf8
}

function Take-Screenshot {
  param([string]$Tag = "error")
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp    = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $g      = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $path = Join-Path $screenshotDir ((Get-Date -f "yyyyMMdd_HHmmssfff") + "_$Tag.png")
    $bmp.Save($path)
    $bmp.Dispose(); $g.Dispose()
    return $path
  } catch { return $null }
}

function Get-FileSha256 {
  param([string]$Path)
  (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLower()
}

# ---------------------------------------------------------------------
# .NET 9 introduced ReadOnlySpan<char> overloads on Encoding.GetBytes,
# Path.GetFileName, and File.ReadAllBytes. PowerShell's method binder
# enumerates every candidate overload and crashes building a generic
# delegate for the span overload, even when the actual argument is a
# string. Symptom seen under UiPath InvokePowerShell:
#   "GenericArguments[0], 'System.ReadOnlySpan`1[System.Char]', on
#    'System.Func`3[T1,T2,TResult]' violates the constraint of type 'T1'."
# Workaround: resolve the specific (string)-overload via reflection once
# and invoke through MethodInfo, bypassing the binder.
# ---------------------------------------------------------------------
$Utf8                  = [System.Text.Encoding]::UTF8
$_M_GetBytes_String    = [System.Text.Encoding].GetMethod('GetBytes',    [Type[]]@([string]))
$_M_GetFileName_String = [System.IO.Path].GetMethod('GetFileName',       [Type[]]@([string]))
$_M_ReadAllBytes       = [System.IO.File].GetMethod('ReadAllBytes',      [Type[]]@([string]))

function Get-Utf8Bytes([string]$s) {
  # comma prevents PowerShell from unrolling the byte[]; cast restores the
  # typed array shape after MethodInfo.Invoke returns it boxed as Object.
  return ,([byte[]]$_M_GetBytes_String.Invoke($Utf8, @($s)))
}
function Get-FileNameSafe([string]$p) {
  return [string]$_M_GetFileName_String.Invoke($null, @($p))
}
function Get-AllBytesSafe([string]$p) {
  return ,([byte[]]$_M_ReadAllBytes.Invoke($null, @($p)))
}

# ---------------------------------------------------------------------
# Manual multipart/form-data uploader.
# Windows PowerShell 5.1 has no -Form switch on Invoke-RestMethod, so
# we build the body as raw bytes ourselves. Works on 5.1, 7+, and the
# UiPath InvokePowerShell host.
#
# Implementation note: we accumulate chunks in an ArrayList and stitch
# them together with Buffer.BlockCopy at the end, instead of using a
# MemoryStream. MemoryStream.Write has a ReadOnlySpan<byte> overload
# that trips the same PowerShell method-binder bug as Encoding.GetBytes.
# Buffer.BlockCopy has only the (Array,int,Array,int,int) signature, so
# the binder cannot get confused.
# ---------------------------------------------------------------------
function Invoke-MultipartUpload {
  param(
    [string]$Uri,
    [hashtable]$Headers,
    [string]$FilePath,
    [string]$FileFieldName = "file",
    [hashtable]$Fields = @{}
  )

  $boundary = [System.Guid]::NewGuid().ToString()
  $LF       = "`r`n"
  $chunks   = New-Object System.Collections.ArrayList

  # text fields
  foreach ($key in $Fields.Keys) {
    $chunk  = "--$boundary$LF"
    $chunk += "Content-Disposition: form-data; name=`"$key`"$LF$LF"
    $chunk += "$($Fields[$key])$LF"
    [void]$chunks.Add((Get-Utf8Bytes $chunk))
  }

  # file field header
  $fileName = Get-FileNameSafe $FilePath
  $chunk    = "--$boundary$LF"
  $chunk   += "Content-Disposition: form-data; name=`"$FileFieldName`"; filename=`"$fileName`"$LF"
  $chunk   += "Content-Type: application/octet-stream$LF$LF"
  [void]$chunks.Add((Get-Utf8Bytes $chunk))

  # file body
  [void]$chunks.Add((Get-AllBytesSafe $FilePath))

  # closing boundary
  [void]$chunks.Add((Get-Utf8Bytes "$LF--$boundary--$LF"))

  # stitch into one byte[] via Buffer.BlockCopy (no span overloads exist)
  $total = 0
  foreach ($c in $chunks) { $total += $c.Length }
  $body = New-Object byte[] $total
  $pos = 0
  foreach ($c in $chunks) {
    [System.Buffer]::BlockCopy($c, 0, $body, $pos, $c.Length)
    $pos += $c.Length
  }

  Invoke-RestMethod -Method Post -Uri $Uri `
    -Headers $Headers `
    -ContentType "multipart/form-data; boundary=$boundary" `
    -Body $body
}

# ---------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------
$processed = 0; $skipped = 0; $failed = 0

Write-Log "INFO" "DHL-KB bot starting. Inbox=$InboxPath  Base=$BaseUrl"

$files = Get-ChildItem -Path $InboxPath -File -ErrorAction SilentlyContinue
Write-Log "INFO" ("Found {0} file(s) to process" -f $files.Count)

foreach ($file in $files) {
  $attempt = 0
  $maxRetry = 3
  $success = $false

  while ($attempt -lt $maxRetry -and -not $success) {
    $attempt++
    try {
      $hash = Get-FileSha256 -Path $file.FullName
      Write-Log "INFO" ("Processing {0}  (hash={1})  attempt={2}" -f $file.Name, $hash.Substring(0,12), $attempt)

      # 1. Duplicate check ------------------------------------------------
      $dupResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/duplicate-check" `
        -Headers @{ "x-api-key" = $ApiKey } `
        -ContentType "application/json" `
        -Body (@{ fileHash = $hash } | ConvertTo-Json)

      if ($dupResp.isDuplicate) {
        Write-Log "SKIP" ("Duplicate within 14 days: {0}" -f $file.Name)
        Move-Item -Path $file.FullName -Destination $processedDir -Force
        $skipped++
        $success = $true
        break
      }

      # 2. Ingest (multipart) --------------------------------------------
      $fileType = $file.Extension.TrimStart('.').ToLower()
      $ingestResp = Invoke-MultipartUpload `
        -Uri      "$BaseUrl/api/ingest" `
        -Headers  @{ "x-api-key" = $ApiKey } `
        -FilePath $file.FullName `
        -Fields   @{ type = $fileType; content = "" }
      # /api/ingest returns { id, status, isDuplicate }
      # If the server-side inline duplicate check fires, it returns
      # { isDuplicate: true } with no id â€” treat that as a skip too.
      if ($ingestResp.isDuplicate) {
        Write-Log "SKIP" ("Ingest duplicate (inline check): {0}" -f $file.Name)
        Move-Item -Path $file.FullName -Destination $processedDir -Force
        $skipped++
        $success = $true
        break
      }
      $rawId = $ingestResp.id
      Write-Log "INFO" ("Ingested id={0}" -f $rawId)
      if (-not $rawId) {
        throw "API /ingest did not return an id. Response: $($ingestResp | ConvertTo-Json -Compress)"
      }

      # 3. Process via Gemini --------------------------------------------
      $procResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/process" `
        -Headers @{ "x-api-key" = $ApiKey } `
        -ContentType "application/json" `
        -Body (@{ rawInputId = $rawId } | ConvertTo-Json)
      $articleId = $procResp.article.id
      Write-Log "INFO" ("Article created id={0} title=`"{1}`"" -f $articleId, $procResp.article.title)

      # 4. Optional auto-promote to reviewed ------------------------------
      if ($AutoPromote) {
        Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/articles/$articleId/status" `
          -Headers @{ "x-api-key" = $ApiKey } `
          -ContentType "application/json" `
          -Body (@{ status = "reviewed"; note = "Auto-promoted by RPA" } | ConvertTo-Json) | Out-Null
        Write-Log "INFO" ("Promoted {0} -> reviewed" -f $articleId)
      }

      # 5. Move file to processed/ ---------------------------------------
      Move-Item -Path $file.FullName -Destination $processedDir -Force
      Write-Log "OK"  ("{0} -> article {1}" -f $file.Name, $articleId)
      $processed++
      $success = $true
    }
    catch {
      $code = "n/a"
      try { $code = $_.Exception.Response.StatusCode.Value__ } catch {}
      Write-Log "ERROR" ("Attempt {0}/{1} failed for {2}: {3} (HTTP {4})" -f $attempt, $maxRetry, $file.Name, $_.Exception.Message, $code)

      if ($attempt -ge $maxRetry) {
        $shot = Take-Screenshot -Tag $file.BaseName
        $row = '"{0}","{1}","{2}","{3}"' -f (Get-Date -f "u"), $file.Name, $code, ($_.Exception.Message -replace '"','""')
        $row | Out-File $errorsCsv -Append -Encoding utf8
        if ($shot) { Write-Log "SCREENSHOT" $shot }
        $failed++
      } else {
        Start-Sleep -Seconds ([math]::Pow(2, $attempt))   # exponential backoff
      }
    }
  }
}

# ---------------------------------------------------------------------
# Daily summary email
# ---------------------------------------------------------------------
try {
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/summary-report" `
    -Headers @{ "x-api-key" = $ApiKey } `
    -ContentType "application/json" `
    -Body (@{ adminEmail = $AdminEmail } | ConvertTo-Json) | Out-Null
  Write-Log "INFO" "Summary report POSTed"
} catch {
  Write-Log "WARN" ("Summary report failed: " + $_.Exception.Message)
}

Write-Log "DONE" ("processed={0} skipped={1} failed={2}" -f $processed, $skipped, $failed)

# Return totals for UiPath callers
[PSCustomObject]@{
  TotalProcessed = $processed
  TotalSkipped   = $skipped
  TotalFailed    = $failed
}
