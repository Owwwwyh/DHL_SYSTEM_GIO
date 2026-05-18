# =====================================================================
#  DHL Knowledge Base, Google Drive puller
#
#  Downloads new files from a Google Drive folder into the folder
#  watched by Run-Bot.ps1. Skips files that have already been
#  downloaded by tracking their Drive fileId in a small state file.
#
#  AUTH MODEL
#    Uses the OAuth 2.0 installed-application flow:
#      1. First run pops your browser, you sign in with your Google
#         account and grant the "drive.readonly" scope.
#      2. Script captures the auth code from a local loopback
#         redirect, exchanges it for an access + refresh token, and
#         persists the refresh token to oauth-refresh-token.json
#         (chmod-restricted, ignored by git).
#      3. Subsequent runs read the refresh token, mint a new access
#         token, and proceed unattended.
#
#  PREREQUISITES (one-time, Google Cloud Console)
#    a. Create or pick a Google Cloud project.
#    b. APIs & Services -> Library -> enable "Google Drive API".
#    c. APIs & Services -> Credentials -> Create Credentials ->
#       OAuth client ID -> Application type "Desktop app".
#    d. Download the JSON. Save it as:
#         F:\dhl-kb-system\uipath\.secrets\oauth-client.json
#    e. APIs & Services -> OAuth consent screen ->
#       Add your Google email as a Test user (while app is in Testing).
#    f. Identify the Drive folder you want to ingest from. Open it in
#       drive.google.com -> the folder URL ends with the folder ID:
#         https://drive.google.com/drive/folders/<FOLDER_ID>
#       Pass that ID as -DriveFolderId.
#
#  USAGE
#    .\Pull-Drive.ps1 -DriveFolderId "1AbCdEf..."           # default settings
#    .\Pull-Drive.ps1 -DriveFolderId "1AbCdEf..." -MaxFiles 20
#
#  EXIT CODE
#    0 = success
#    1 = configuration error (missing client secrets, etc.)
#    2 = auth error
# =====================================================================

param(
  [Parameter(Mandatory = $true)]
  [string]$DriveFolderId,
  [string]$InboxPath        = "F:\DHL_Inbox",
  [string]$SecretsDir       = "F:\dhl-kb-system\uipath\.secrets",
  [int]$MaxFiles            = 50,
  [string]$LogPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $InboxPath)) {
  New-Item -ItemType Directory -Path $InboxPath -Force | Out-Null
}
if (-not (Test-Path $SecretsDir)) {
  New-Item -ItemType Directory -Path $SecretsDir -Force | Out-Null
}

if (-not $LogPath) {
  $logsDir = Join-Path $InboxPath "logs"
  if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
  $LogPath = Join-Path $logsDir ("pull-drive-" + (Get-Date -f "yyyyMMdd") + ".txt")
}

function Write-Log {
  param([string]$Level, [string]$Message)
  $line = "[{0}] [{1}] {2}" -f (Get-Date -f "u"), $Level, $Message
  Write-Host $line
  $line | Out-File $LogPath -Append -Encoding utf8
}

function Get-SafeFileName([string]$s) {
  if (-not $s) { return "untitled" }
  $invalid = [IO.Path]::GetInvalidFileNameChars() -join ''
  $rx = "[{0}]" -f [Regex]::Escape($invalid)
  $clean = [Regex]::Replace($s, $rx, "_")
  if ($clean.Length -gt 120) { $clean = $clean.Substring(0, 120) }
  return $clean.Trim()
}

$ClientSecretsPath = Join-Path $SecretsDir "oauth-client.json"
$RefreshTokenPath  = Join-Path $SecretsDir "oauth-refresh-token.json"
$SeenFileIdsPath   = Join-Path $SecretsDir "drive-seen-fileids.json"
$Scope             = "https://www.googleapis.com/auth/drive.readonly"

Write-Log "INFO" "Drive puller starting. Folder=$DriveFolderId  Inbox=$InboxPath  MaxFiles=$MaxFiles"

# ---------------------------------------------------------------------
# Load client secrets
# ---------------------------------------------------------------------
if (-not (Test-Path $ClientSecretsPath)) {
  Write-Log "ERROR" "OAuth client secrets not found at $ClientSecretsPath. See header comment in this file for one-time setup."
  exit 1
}
$clientJson = Get-Content $ClientSecretsPath -Raw | ConvertFrom-Json
if ($clientJson.installed) { $clientCfg = $clientJson.installed }
elseif ($clientJson.web)   { $clientCfg = $clientJson.web }
else {
  Write-Log "ERROR" "OAuth client JSON does not contain an 'installed' or 'web' section."
  exit 1
}
$ClientId     = $clientCfg.client_id
$ClientSecret = $clientCfg.client_secret
$TokenUri     = "https://oauth2.googleapis.com/token"

# ---------------------------------------------------------------------
# Refresh-token-based access token (subsequent runs)
# ---------------------------------------------------------------------
function Get-AccessTokenFromRefresh([string]$refreshToken) {
  $body = @{
    client_id     = $ClientId
    client_secret = $ClientSecret
    refresh_token = $refreshToken
    grant_type    = "refresh_token"
  }
  return (Invoke-RestMethod -Method Post -Uri $TokenUri -Body $body)
}

# ---------------------------------------------------------------------
# First-run installed-app OAuth flow with loopback redirect
# ---------------------------------------------------------------------
function Start-InteractiveOAuth {
  # Pick a free local port; the OAuth Desktop client allows any
  # http://127.0.0.1:<port> redirect URI without prior registration.
  $listener = New-Object System.Net.HttpListener
  $port = 0
  for ($p = 53682; $p -lt 54000; $p++) {
    try {
      $listener.Prefixes.Clear()
      $listener.Prefixes.Add("http://127.0.0.1:$p/")
      $listener.Start()
      $port = $p
      break
    } catch { continue }
  }
  if ($port -eq 0) { throw "Could not bind a local loopback port for OAuth." }

  $redirectUri = "http://127.0.0.1:$port/"
  $state       = [Guid]::NewGuid().ToString("N")

  $authUri = "https://accounts.google.com/o/oauth2/v2/auth" +
             "?client_id=" + [Uri]::EscapeDataString($ClientId) +
             "&redirect_uri=" + [Uri]::EscapeDataString($redirectUri) +
             "&response_type=code" +
             "&scope=" + [Uri]::EscapeDataString($Scope) +
             "&access_type=offline&prompt=consent" +
             "&state=" + $state

  Write-Log "INFO" "Opening browser for Google sign-in. Approve the drive.readonly scope."
  Start-Process $authUri

  $context = $listener.GetContext()    # blocks until Google redirects back
  $queryString = $context.Request.Url.Query
  $response = $context.Response

  $html = "<html><body style='font-family:sans-serif;padding:2em'><h1>DHL KB ingestion bot</h1><p>Authorisation captured. You can close this tab.</p></body></html>"
  $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
  $response.ContentLength64 = $buffer.Length
  $response.OutputStream.Write($buffer, 0, $buffer.Length)
  $response.OutputStream.Close()
  $listener.Stop()

  # Parse "?code=...&state=..." (or "?error=...")
  $params = @{}
  foreach ($pair in $queryString.TrimStart('?').Split('&')) {
    $kv = $pair.Split('=', 2)
    if ($kv.Length -eq 2) { $params[$kv[0]] = [Uri]::UnescapeDataString($kv[1]) }
  }
  if ($params.ContainsKey("error")) {
    throw "OAuth error: " + $params["error"]
  }
  if ($params["state"] -ne $state) {
    throw "OAuth state mismatch (possible CSRF). Aborting."
  }
  $code = $params["code"]
  if (-not $code) { throw "Did not receive an authorisation code." }

  $body = @{
    code          = $code
    client_id     = $ClientId
    client_secret = $ClientSecret
    redirect_uri  = $redirectUri
    grant_type    = "authorization_code"
  }
  return (Invoke-RestMethod -Method Post -Uri $TokenUri -Body $body)
}

# ---------------------------------------------------------------------
# Get a valid access token, using refresh token if we have one.
# ---------------------------------------------------------------------
$accessToken = $null
if (Test-Path $RefreshTokenPath) {
  try {
    $stored = Get-Content $RefreshTokenPath -Raw | ConvertFrom-Json
    Write-Log "INFO" "Refreshing access token from stored refresh token."
    $tokens = Get-AccessTokenFromRefresh $stored.refresh_token
    $accessToken = $tokens.access_token
  } catch {
    Write-Log "WARN" ("Refresh token failed (" + $_.Exception.Message + "). Falling back to interactive sign-in.")
  }
}

if (-not $accessToken) {
  try {
    $tokens = Start-InteractiveOAuth
    $accessToken = $tokens.access_token
    if ($tokens.refresh_token) {
      $tokens | Select-Object refresh_token, scope, token_type | ConvertTo-Json | Out-File $RefreshTokenPath -Encoding utf8
      Write-Log "INFO" "Refresh token saved to $RefreshTokenPath. Future runs will be unattended."
    } else {
      Write-Log "WARN" "Google returned no refresh_token. You may have to re-authenticate every hour. Tip: include &prompt=consent (already done)."
    }
  } catch {
    Write-Log "ERROR" ("Interactive OAuth failed: " + $_.Exception.Message)
    exit 2
  }
}

# ---------------------------------------------------------------------
# Load seen-fileid set so we skip files we've already downloaded.
# ---------------------------------------------------------------------
$seen = @{}
if (Test-Path $SeenFileIdsPath) {
  try {
    $arr = Get-Content $SeenFileIdsPath -Raw | ConvertFrom-Json
    foreach ($id in $arr) { $seen[$id] = $true }
  } catch { Write-Log "WARN" "Could not parse $SeenFileIdsPath, starting fresh." }
}
Write-Log "INFO" ("Already-seen fileIds: {0}" -f $seen.Count)

# ---------------------------------------------------------------------
# List files in the configured Drive folder.
# Excludes the Drive-native Doc/Sheet/Slide types (those need export,
# not download). Add export handling later if needed.
# ---------------------------------------------------------------------
$listUri = "https://www.googleapis.com/drive/v3/files" +
           "?q=" + [Uri]::EscapeDataString("'$DriveFolderId' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'") +
           "&fields=files(id,name,mimeType,size,md5Checksum,modifiedTime)" +
           "&pageSize=" + ([Math]::Min($MaxFiles, 1000))

$headers = @{ Authorization = "Bearer $accessToken" }

try {
  $listResp = Invoke-RestMethod -Method Get -Uri $listUri -Headers $headers
} catch {
  Write-Log "ERROR" ("Drive list failed: " + $_.Exception.Message)
  exit 2
}

$files = @($listResp.files)
Write-Log "INFO" ("Folder contains {0} non-folder file(s)" -f $files.Count)

$downloaded = 0
$skipped = 0
$failed = 0

foreach ($f in $files) {
  if ($seen.ContainsKey($f.id)) { $skipped++; continue }
  if ($f.mimeType -like "application/vnd.google-apps.*") {
    Write-Log "SKIP" ("Drive-native type (export not implemented): " + $f.name + " [" + $f.mimeType + "]")
    $seen[$f.id] = $true  # don't try again next run
    continue
  }
  if ($downloaded -ge $MaxFiles) { break }

  try {
    $cleanName = Get-SafeFileName $f.name
    $target = Join-Path $InboxPath ("gd_" + (Get-Date -f "yyyyMMdd_HHmmss") + "_" + $f.id.Substring(0, 8) + "__" + $cleanName)
    $downloadUri = "https://www.googleapis.com/drive/v3/files/$($f.id)?alt=media"

    Invoke-WebRequest -Method Get -Uri $downloadUri -Headers $headers -OutFile $target | Out-Null

    Write-Log "OK" ("downloaded ({0} bytes) -> {1}" -f $f.size, $target)
    $seen[$f.id] = $true
    $downloaded++
  } catch {
    $failed++
    Write-Log "ERROR" ("fileId=$($f.id) name=$($f.name) : " + $_.Exception.Message)
  }
}

# Persist updated seen-set
@($seen.Keys) | ConvertTo-Json | Out-File $SeenFileIdsPath -Encoding utf8

Write-Log "DONE" ("downloaded={0}  skipped={1}  failed={2}" -f $downloaded, $skipped, $failed)

[PSCustomObject]@{
  Downloaded = $downloaded
  Skipped    = $skipped
  Failed     = $failed
}
