# =====================================================================
#  DHL Knowledge Base, multi-source orchestrator
#
#  Pulls new files from Google Drive (if configured) and then runs
#  Run-Bot.ps1 to ingest everything in the local inbox folder.
#
#  Designed to be the entry point for the scheduled task. The Drive
#  puller is best-effort: if it isn't configured or the API call fails
#  the orchestrator logs a warning and keeps going. The folder-watch
#  pipeline always runs.
#
#  USAGE
#    .\Run-All-Sources.ps1
#    .\Run-All-Sources.ps1 -DriveFolderId "1AbCdEf..." -AutoPromote
# =====================================================================

param(
  [string]$InboxPath        = "F:\DHL_Inbox",
  [string]$BaseUrl          = "https://dhl-system-gio.vercel.app",
  [string]$ApiKey           = "dhl-uipath-secret-2024",
  [string]$AdminEmail       = "admin@dhl.com",
  [string]$DriveFolderId    = $env:DHL_KB_DRIVE_FOLDER_ID,
  [int]$MaxDriveFiles       = 50,
  [switch]$AutoPromote
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$logsDir = Join-Path $InboxPath "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
$orchLog = Join-Path $logsDir ("orchestrator-" + (Get-Date -f "yyyyMMdd") + ".txt")

function Write-Log {
  param([string]$Level, [string]$Message)
  $line = "[{0}] [{1}] {2}" -f (Get-Date -f "u"), $Level, $Message
  Write-Host $line
  $line | Out-File $orchLog -Append -Encoding utf8
}

Write-Log "INFO" "Multi-source orchestrator starting."

# ---------------------------------------------------------------------
# 1. Google Drive (only if folder id + client secrets are configured)
# ---------------------------------------------------------------------
$driveClientSecrets = Join-Path $scriptDir ".secrets\oauth-client.json"
if ($DriveFolderId -and (Test-Path $driveClientSecrets)) {
  Write-Log "INFO" "Drive folder + OAuth client configured, pulling new files."
  try {
    & (Join-Path $scriptDir "Pull-Drive.ps1") `
        -DriveFolderId $DriveFolderId `
        -InboxPath     $InboxPath `
        -MaxFiles      $MaxDriveFiles | Out-Null
  } catch {
    Write-Log "WARN" ("Drive puller failed: " + $_.Exception.Message)
  }
} else {
  $reason = if (-not $DriveFolderId) { "no DriveFolderId param / DHL_KB_DRIVE_FOLDER_ID env var" } else { "no oauth-client.json under .secrets/" }
  Write-Log "INFO" "Skipping Drive puller ($reason)."
}

# ---------------------------------------------------------------------
# 2. Ingest pipeline (always runs; harmless when inbox is empty)
# ---------------------------------------------------------------------
Write-Log "INFO" "Running ingestion pipeline."
$botArgs = @{
  InboxPath  = $InboxPath
  BaseUrl    = $BaseUrl
  ApiKey     = $ApiKey
  AdminEmail = $AdminEmail
}
if ($AutoPromote) { $botArgs.AutoPromote = $true }

try {
  & (Join-Path $scriptDir "Run-Bot.ps1") @botArgs
} catch {
  Write-Log "ERROR" ("Run-Bot failed: " + $_.Exception.Message)
}

Write-Log "DONE" "Orchestrator complete."
