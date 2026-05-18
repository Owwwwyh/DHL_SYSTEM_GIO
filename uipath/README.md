# DHL Knowledge Base — UiPath RPA

This folder contains the RPA components that automate ingestion of raw
operational content into the DHL Knowledge Base web application.

Two source paths are supported today:

1. **Local watch folder** — drop a file into `F:\DHL_Inbox`, the bot picks it up
2. **Google Drive folder** — bot polls a Drive folder, downloads new files, ingests them

Both paths feed the same downstream pipeline: dedup check → ingest → Gemini
processing → article in the KB, with TRY/CATCH, retries, screenshots, and a
daily summary email.

## Files

| File                  | Purpose                                                                    |
|-----------------------|----------------------------------------------------------------------------|
| `Main.xaml`           | UiPath workflow. Calls `Run-Bot.ps1` via `InvokePowerShell`.               |
| `Run-Bot.ps1`         | Folder-watcher: hashes each file, calls the REST API, retries on failure. |
| `Pull-Drive.ps1`      | Downloads new files from a configured Google Drive folder via OAuth.       |
| `Run-All-Sources.ps1` | Orchestrator: runs `Pull-Drive` then `Run-Bot`. Entry point for cron.      |
| `project.json`        | UiPath Studio project descriptor and dependency manifest.                  |
| `HOW_TO_RUN.md`       | Setup + demo walkthrough.                                                  |

`.secrets/` (gitignored) holds the Google OAuth client JSON and the refresh
token after first sign-in.

## Inputs (process arguments / script parameters)

| Argument         | Example                                       | Used by             |
|------------------|-----------------------------------------------|---------------------|
| `in_BaseUrl`     | `https://dhl-system-gio.vercel.app`           | All scripts         |
| `in_ApiKey`      | Same value as `UIPATH_API_KEY` env var        | All scripts         |
| `in_SourcePath`  | `F:\DHL_Inbox` (local folder)                 | `Run-Bot.ps1`       |
| `DriveFolderId`  | Google Drive folder ID (from the folder URL)  | `Pull-Drive.ps1`    |
| `in_AdminEmail`  | `admin@dhl.com`                               | Summary report      |

## End-to-end flow

```
START
  │
  ▼
[Pull-Drive.ps1]  ← list folder via Drive API, download new files
  │                tracked by fileId in .secrets/drive-seen-fileids.json
  ▼               (skipped if no DriveFolderId / no oauth-client.json)
[Run-Bot.ps1]     ← iterate every file in F:\DHL_Inbox
  │
For each file:
  │
  ├─ TRY  ──────────────────────────────────────────────────┐
  │   POST /api/duplicate-check                             │
  │     ├── isDuplicate=true  → log + skip + next iteration │
  │     └── isDuplicate=false → continue                    │
  │   POST /api/ingest         (multipart, file attached)   │
  │     └── capture rawInputId                              │
  │   POST /api/process        body={rawInputId}            │
  │     └── capture article.id                              │
  │   POST /api/articles/:id/status  body={status:reviewed} │   (if -AutoPromote)
  │   Move file → processed\                                │
  │   Log "OK"                                              │
  │                                                         │
  ├─ CATCH (System.Exception)  ─────────────────────────────┤
  │   Retry up to 3 times with exponential backoff          │
  │   Take Screenshot → logs/screenshots/<ts>.png           │
  │   Append error row → logs/errors.csv                    │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
  │
  ▼
POST /api/summary-report   (sends daily admin email)
  │
  ▼
END
```

## HTTP examples (drop into UiPath HTTP Request activity)

```http
POST {{in_BaseUrl}}/api/duplicate-check
x-api-key: {{in_ApiKey}}
Content-Type: application/json

{ "fileHash": "{{sha256}}" }
```

```http
POST {{in_BaseUrl}}/api/ingest
x-api-key: {{in_ApiKey}}
Content-Type: multipart/form-data

type=pdf
content=
file=@<path>
```

```http
POST {{in_BaseUrl}}/api/process
x-api-key: {{in_ApiKey}}
Content-Type: application/json

{ "rawInputId": "{{rawId}}" }
```

```http
POST {{in_BaseUrl}}/api/articles/{{articleId}}/status
x-api-key: {{in_ApiKey}}
Content-Type: application/json

{ "status": "reviewed", "note": "Auto-promoted by RPA" }
```

```http
POST {{in_BaseUrl}}/api/summary-report
x-api-key: {{in_ApiKey}}
Content-Type: application/json

{ "adminEmail": "{{in_AdminEmail}}" }
```

## Google Drive integration

`Pull-Drive.ps1` uses the OAuth 2.0 installed-application flow. First run pops a
browser for sign-in and grants `drive.readonly`; the refresh token is then
stored locally so subsequent runs are unattended.

Setup is one-time and lives in [`HOW_TO_RUN.md`](./HOW_TO_RUN.md). Summary:

1. Google Cloud Console → enable Drive API → create OAuth client (Desktop type)
2. Save the downloaded JSON as `uipath/.secrets/oauth-client.json`
3. Identify the Drive folder ID (last segment of its URL)
4. Run `Pull-Drive.ps1 -DriveFolderId "<ID>"` once → sign in once → done

After that the orchestrator (and the Windows scheduled task that runs it) can
poll Drive every minute without user interaction. Files appear in the KB as
draft articles within ~60 seconds of upload.

## Governance

* **Logs** — every iteration writes `logs/run-YYYYMMDD.txt` with a one-line
  status (`OK`, `SKIP`, `ERROR`).
* **Errors** — failures append to `logs/errors.csv`
  (`timestamp, file, http_code, error_message`).
* **Screenshots** — taken on every catch →
  `logs/screenshots/<timestamp>.png`.
* **Retries** — `Run-Bot.ps1` retries each file up to 3 times with exponential
  backoff before logging it as `failed`.
* **Dedup** — three layers: Drive `fileId` set (`.secrets/drive-seen-fileids.json`),
  inbox move-to-`processed/`, and server-side SHA hash over a 14-day window.
* **Daily summary email** — `POST /api/summary-report` triggers a server-side
  email digest via SMTP env vars on the web app.
