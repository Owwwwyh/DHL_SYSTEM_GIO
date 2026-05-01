# DHL Knowledge Base — UiPath RPA

This folder contains the UiPath Studio project that automates ingestion of raw
operational content (Google Drive files, Outlook attachments, or a local watch
folder) into the DHL Knowledge Base web application.

## Files

| File           | Purpose                                                             |
|----------------|---------------------------------------------------------------------|
| `Main.xaml`    | Main workflow with branching, Try/Catch, screenshot-on-fail, retries|
| `project.json` | UiPath Studio project descriptor and dependency manifest            |

## Inputs (Orchestrator assets or process arguments)

| Argument        | Example                                  |
|-----------------|------------------------------------------|
| `in_BaseUrl`    | `https://kb.dhl.example.com`             |
| `in_ApiKey`     | Same value as `UIPATH_API_KEY` env var   |
| `in_SourceType` | `googledrive` \| `outlook` \| `folder`   |
| `in_SourcePath` | drive folder ID / mailbox / `\\\\share\\inbox` |
| `in_AdminEmail` | `admin@dhl.com`                          |

## End-to-end flow

```
START
  │
  ▼
[Read API key from Orchestrator asset]
  │
  ▼
[Enumerate files from source]   ← Google Drive / Outlook / Folder
  │
  ▼
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
  │   POST /api/articles/:id/status  body={status:reviewed} │
  │   Log "OK"                                              │
  │                                                         │
  ├─ CATCH (System.Exception)  ─────────────────────────────┤
  │   Take Screenshot → logs/screenshots/<ts>.png           │
  │   Append error row → logs/errors.csv                    │
  │   Increment retry counter (RetryScope, max 3, expo b/o) │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
  │
  ▼
POST /api/summary-report   (sends daily admin email)
  │
  ▼
END (return processed / skipped / failed counts)
```

## HTTP examples (drop into UiPath HTTP Request activity)

```http
POST {{in_BaseUrl}}/api/duplicate-check
Content-Type: application/json

{ "fileHash": "{{md5}}" }
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

## Governance

* **Logs** — every iteration writes `logs/run-YYYYMMDD.txt` with a one-line
  status (`OK`, `SKIP`, `ERROR`).
* **Errors** — failures append to `logs/errors.csv`
  (`timestamp, file, http_code, error_message`).
* **Screenshots** — taken on every catch via `TakeScreenshot` →
  `logs/screenshots/<timestamp>.png`.
* **Retries** — `Main.xaml` is meant to be wrapped in `RetryScope`
  (`NumberOfRetries=3`, `RetryInterval=00:00:05`) per iteration.
* **Daily summary email** — `POST /api/summary-report` triggers a server-side
  email digest via SMTP env vars on the web app.
