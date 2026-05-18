# How to run the UiPath bot (demo + setup guide)

The RPA bot has two input paths today:

- **Local watch folder** — drop a file into `F:\DHL_Inbox`, it ingests it.
- **Google Drive folder** — bot polls Drive every minute, downloads new files, ingests them.

Both feed the same downstream pipeline (dedup → ingest → Gemini → KB article).

---

## One-time folder structure

On `F:\`:

```
F:\DHL_Inbox\              <- drop files here
F:\DHL_Inbox\processed\    <- bot moves files here after ingesting
F:\DHL_Inbox\logs\         <- run-YYYYMMDD.txt, errors.csv, orchestrator-*.txt
F:\DHL_Inbox\logs\screenshots\
```

The bot auto-creates any missing folders on first run.

---

## Path A — local folder only

### Run once from PowerShell

```powershell
F:\dhl-kb-system\uipath\Run-Bot.ps1
# or with explicit args:
F:\dhl-kb-system\uipath\Run-Bot.ps1 `
  -InboxPath  "F:\DHL_Inbox" `
  -BaseUrl    "https://dhl-system-gio.vercel.app" `
  -ApiKey     "dhl-uipath-secret-2024" `
  -AdminEmail "admin@dhl.com" `
  -AutoPromote
```

### Run via UiPath Studio

1. Open **UiPath Studio**.
2. **Open** → `F:\dhl-kb-system\uipath\project.json`.
3. Open `Main.xaml`.
4. **Ctrl+F6** (Run File).
5. UiPath invokes `Run-Bot.ps1` via `InvokePowerShell` with default arguments.
6. Watch the Output panel; full per-file log lands in `F:\DHL_Inbox\logs\`.

---

## Path B — Google Drive integration

`Pull-Drive.ps1` polls a Drive folder, downloads new files into `F:\DHL_Inbox\`,
and Run-Bot picks them up.

### One-time Google Cloud setup (5 minutes)

1. **Pick / create a Cloud project** at
   <https://console.cloud.google.com/projectcreate>.
2. **Enable Drive API** at
   <https://console.cloud.google.com/apis/library/drive.googleapis.com>.
3. **OAuth consent screen** at
   <https://console.cloud.google.com/apis/credentials/consent>:
   - User Type: External
   - Add your Gmail address as a **Test user**
4. **Create OAuth client** at
   <https://console.cloud.google.com/apis/credentials>:
   - + Create Credentials → OAuth client ID
   - Application type: **Desktop app** (important)
   - Download the JSON
5. **Save the JSON** as
   `F:\dhl-kb-system\uipath\.secrets\oauth-client.json`
   (The `.secrets/` folder is gitignored.)
6. **Get the Drive folder ID.** Open the folder in
   <https://drive.google.com> → copy the long ID at the end of the URL:
   `https://drive.google.com/drive/folders/`**`1AbCdEf...`**

### First run (browser opens once)

```powershell
F:\dhl-kb-system\uipath\Pull-Drive.ps1 -DriveFolderId "<your-folder-id>"
```

A browser tab opens. Sign in with the Gmail you added as a test user. Click
**Advanced → Go to DHL KB Ingestion (unsafe)** on the "unverified app"
warning. Grant the `drive.readonly` scope. The browser shows
"Authorisation captured. You can close this tab." A refresh token is saved to
`.secrets/oauth-refresh-token.json` — future runs are unattended.

### Subsequent runs (orchestrator)

```powershell
F:\dhl-kb-system\uipath\Run-All-Sources.ps1 -DriveFolderId "<your-folder-id>"
```

Runs `Pull-Drive.ps1` then `Run-Bot.ps1` in sequence.

---

## Auto-ingest every minute (Windows Scheduled Task)

```powershell
$pwsh   = "C:\Program Files (x86)\PowerShell\7\pwsh.exe"
$script = "F:\dhl-kb-system\uipath\Run-All-Sources.ps1"
$folder = "<your-drive-folder-id>"   # optional; omit if folder-only

$action = New-ScheduledTaskAction `
  -Execute $pwsh `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -DriveFolderId `"$folder`"" `
  -WorkingDirectory "F:\dhl-kb-system\uipath"

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(30) `
  -RepetitionInterval (New-TimeSpan -Minutes 1)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName "DHL-KB-Ingest-Bot" `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
```

Manage afterwards:

```powershell
Disable-ScheduledTask  -TaskName "DHL-KB-Ingest-Bot"
Enable-ScheduledTask   -TaskName "DHL-KB-Ingest-Bot"
Start-ScheduledTask    -TaskName "DHL-KB-Ingest-Bot"
Unregister-ScheduledTask -TaskName "DHL-KB-Ingest-Bot" -Confirm:$false
```

---

## What the bot does for each file

1. Compute SHA256 hash.
2. `POST /api/duplicate-check`.
   - If duplicate, log `SKIP`, move file to `processed\`, continue.
3. `POST /api/ingest` (multipart upload).
4. `POST /api/process` (Gemini extracts the SOP).
5. If `-AutoPromote`, `POST /api/articles/:id/status` `{ status: "reviewed" }`.
6. Move file to `processed\` and log `OK`.
7. On any error: 3 retries with exponential backoff, screenshot the desktop,
   append to `errors.csv`.
8. After all files, `POST /api/summary-report` to email the admin a daily digest.

---

## Dedup is automatic at three layers

| Layer | What it tracks | Where stored |
|---|---|---|
| Drive fileId set | files already downloaded from Drive | `.secrets/drive-seen-fileids.json` |
| Local inbox move | files already ingested | `F:\DHL_Inbox\processed\` |
| Server-side hash | content already seen in last 14 days | Neon Postgres `RawInput.fileHash` |

You never have to manually mark a file as "already processed."

---

## Demo script (60 seconds)

1. Show `F:\DHL_Inbox\` empty in File Explorer.
2. Either:
   - Drag a PDF/DOCX/TXT into `F:\DHL_Inbox\`, **or**
   - Drag it into your Drive folder (auto-pulled within ~60s).
3. Within a minute, the file shows up at
   <https://dhl-system-gio.vercel.app/articles> as a draft.
4. Open the version history — the audit row shows `source = uipath`.
