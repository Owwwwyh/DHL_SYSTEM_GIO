import React from "react";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  auth: string;
  description: string;
  requestExample?: string;
  responseExample: string;
}

interface EndpointGroup {
  name: string;
  endpoints: Endpoint[];
}

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-blue-100 text-blue-700 border border-blue-200",
  POST:   "bg-green-100 text-green-700 border border-green-200",
  PUT:    "bg-yellow-100 text-yellow-700 border border-yellow-200",
  DELETE: "bg-red-100 text-red-700 border border-red-200",
};

const endpointGroups: EndpointGroup[] = [
  {
    name: "Ingestion",
    endpoints: [
      {
        method: "POST",
        path: "/api/ingest",
        auth: "x-api-key OR session",
        description: "Submit new raw input to the knowledge base. Accepts multipart/form-data with fields: type (email|chat|screenshot|note|powerpoint|pdf|docx|manual), content (text body), file (binary upload). Also accepts JSON body with the same fields. Automatically checks for duplicates before storing. Returns the created raw input record.",
        requestExample: JSON.stringify({
          type: "email",
          content: "Please ensure all parcels are scanned at induction point before loading..."
        }, null, 2),
        responseExample: JSON.stringify({
          id: "clx1abc123",
          status: "pending",
          isDuplicate: false
        }, null, 2),
      },
      {
        method: "GET",
        path: "/api/ingest",
        auth: "x-api-key OR session",
        description: "List all raw inputs in the system. Filter by processing status. Useful for monitoring the ingestion pipeline and identifying failed or stuck items.",
        requestExample: "GET /api/ingest?status=pending&limit=50",
        responseExample: JSON.stringify([
          {
            id: "clx1abc123",
            type: "email",
            status: "pending",
            hash: "sha256:abc123...",
            createdAt: "2026-04-30T10:00:00Z"
          },
          {
            id: "clx1def456",
            type: "pdf",
            status: "done",
            hash: "sha256:def456...",
            createdAt: "2026-04-29T14:30:00Z"
          }
        ], null, 2),
      },
      {
        method: "POST",
        path: "/api/duplicate-check",
        auth: "None required (recommended: x-api-key)",
        description: "Check whether a piece of content has already been submitted to the system, before sending the full payload. Accepts either raw content text or a SHA-256 file hash. Use this before calling POST /api/ingest to avoid unnecessary uploads.",
        requestExample: JSON.stringify({
          content: "Please ensure all parcels are scanned...",
          fileHash: "sha256:abc123def456..."
        }, null, 2),
        responseExample: JSON.stringify({
          isDuplicate: true,
          hash: "sha256:abc123def456...",
          existingId: "clx1abc123"
        }, null, 2),
      },
    ],
  },
  {
    name: "Processing",
    endpoints: [
      {
        method: "POST",
        path: "/api/process",
        auth: "session OR x-api-key",
        description: "Trigger Gemini AI processing for a raw input. Extracts structured article data (title, summary, steps, tags, relatedLinks) from the raw content. Creates a new Article record in 'draft' status. Detects potential conflicts with existing published articles. This is the second step after ingestion.",
        requestExample: JSON.stringify({
          rawInputId: "clx1abc123"
        }, null, 2),
        responseExample: JSON.stringify({
          article: {
            id: "art_xyz789",
            title: "Parcel Scanning Procedure at Induction Points",
            summary: "Standard procedure for scanning parcels during induction...",
            status: "draft",
            hasConflict: false,
            tags: "[\"scanning\",\"induction\",\"parcels\"]",
            createdAt: "2026-04-30T10:05:00Z"
          }
        }, null, 2),
      },
    ],
  },
  {
    name: "Articles",
    endpoints: [
      {
        method: "GET",
        path: "/api/articles",
        auth: "x-api-key OR session",
        description: "List articles with full-text search and filtering. Supports pagination. Use this endpoint to build dashboards, export article lists, or feed article data into UiPath workflows. Results are ordered by most recently updated.",
        requestExample: "GET /api/articles?q=parcel+scanning&status=published&tag=induction&from=2026-01-01&to=2026-04-30&page=1&pageSize=20",
        responseExample: JSON.stringify({
          articles: [
            {
              id: "art_xyz789",
              title: "Parcel Scanning Procedure at Induction Points",
              summary: "Standard procedure for scanning parcels...",
              status: "published",
              tags: "[\"scanning\",\"induction\"]",
              sourceType: "email",
              hasConflict: false,
              updatedAt: "2026-04-30T10:05:00Z"
            }
          ],
          pagination: {
            page: 1,
            pageSize: 20,
            total: 47,
            totalPages: 3,
            hasNext: true,
            hasPrev: false
          }
        }, null, 2),
      },
      {
        method: "POST",
        path: "/api/articles",
        auth: "session",
        description: "Manually create a new article without going through the AI processing pipeline. Useful for importing pre-structured content or creating articles from templates. Article is created in 'draft' status.",
        requestExample: JSON.stringify({
          title: "Manual Parcel Entry Procedure",
          summary: "Steps for manually entering parcel data when scanning is unavailable.",
          steps: ["Step 1: Open manual entry screen", "Step 2: Enter parcel barcode manually"],
          tags: ["manual", "parcels", "fallback"],
          relatedLinks: ["https://intranet.dhl.com/manual-entry"],
          sourceType: "manual"
        }, null, 2),
        responseExample: JSON.stringify({
          id: "art_new001",
          title: "Manual Parcel Entry Procedure",
          status: "draft",
          createdAt: "2026-04-30T11:00:00Z"
        }, null, 2),
      },
      {
        method: "GET",
        path: "/api/articles/:id",
        auth: "session",
        description: "Retrieve a single article by ID, including full content (all steps, tags, related links) and version history. Use this to display article details or export a specific SOP.",
        responseExample: JSON.stringify({
          id: "art_xyz789",
          title: "Parcel Scanning Procedure at Induction Points",
          summary: "Standard procedure for scanning parcels during induction...",
          steps: "[\"Step 1: Log in to scanning terminal\",\"Step 2: Position parcel under scanner\"]",
          tags: "[\"scanning\",\"induction\",\"parcels\"]",
          relatedLinks: "[]",
          sourceType: "email",
          status: "published",
          hasConflict: false,
          conflictNote: null,
          updatedAt: "2026-04-30T10:05:00Z",
          user: { name: "DHL Admin", email: "admin@dhl.com" }
        }, null, 2),
      },
      {
        method: "PUT",
        path: "/api/articles/:id",
        auth: "session",
        description: "Update article content. All fields are optional — only provided fields will be updated. Creates a version history entry for the edit. The article status is not changed by this endpoint; use POST /api/articles/:id/status for status transitions.",
        requestExample: JSON.stringify({
          title: "Updated: Parcel Scanning at Induction Points",
          summary: "Revised procedure incorporating new scanning hardware.",
          steps: ["Step 1: Power on the new Zebra scanner", "Step 2: Scan parcel barcode"],
          tags: ["scanning", "induction", "parcels", "zebra"],
          relatedLinks: ["https://intranet.dhl.com/zebra-guide"]
        }, null, 2),
        responseExample: JSON.stringify({
          id: "art_xyz789",
          title: "Updated: Parcel Scanning at Induction Points",
          status: "draft",
          updatedAt: "2026-04-30T12:00:00Z"
        }, null, 2),
      },
      {
        method: "DELETE",
        path: "/api/articles/:id",
        auth: "session (reviewer role or above)",
        description: "Permanently delete an article and all its version history. This action is irreversible. Requires reviewer or admin role. Published articles should be archived rather than deleted where possible.",
        responseExample: JSON.stringify({ success: true }, null, 2),
      },
      {
        method: "POST",
        path: "/api/articles/:id/status",
        auth: "session",
        description: "Transition an article through the editorial workflow. Valid transitions: draft → reviewed → published → archived. You can also send an article back: published → archived, reviewed → draft, archived → draft. Each transition is logged in the version history with an optional note.",
        requestExample: JSON.stringify({
          status: "reviewed",
          note: "Content verified against SOP v3.2. Ready for publication."
        }, null, 2),
        responseExample: JSON.stringify({
          id: "art_xyz789",
          status: "reviewed",
          updatedAt: "2026-04-30T13:00:00Z"
        }, null, 2),
      },
      {
        method: "GET",
        path: "/api/articles/:id/versions",
        auth: "session",
        description: "Retrieve the full audit trail for an article. Each entry records who made what change and when, along with any notes. Entries are ordered from most recent to oldest.",
        responseExample: JSON.stringify([
          {
            id: "v_001",
            action: "status_changed",
            status: "reviewed",
            note: "Content verified against SOP v3.2",
            createdAt: "2026-04-30T13:00:00Z",
            user: { name: "KB Reviewer", email: "reviewer@dhl.com" }
          },
          {
            id: "v_002",
            action: "edited",
            status: "draft",
            note: "Updated steps for new Zebra scanner",
            createdAt: "2026-04-30T12:00:00Z",
            user: { name: "KB Editor", email: "editor@dhl.com" }
          },
          {
            id: "v_003",
            action: "created",
            status: "draft",
            note: null,
            createdAt: "2026-04-30T10:05:00Z",
            user: { name: "DHL Admin", email: "admin@dhl.com" }
          }
        ], null, 2),
      },
    ],
  },
  {
    name: "Reports & Stats",
    endpoints: [
      {
        method: "GET",
        path: "/api/stats",
        auth: "x-api-key OR session",
        description: "Retrieve full system statistics including article counts by status, recent activity, ingestion pipeline status, processing success rate, and tag distribution. Useful for dashboard widgets and health monitoring.",
        responseExample: JSON.stringify({
          articles: {
            total: 120,
            draft: 15,
            reviewed: 8,
            published: 90,
            archived: 7
          },
          rawInputs: {
            total: 200,
            pending: 5,
            done: 185,
            failed: 10
          },
          recentActivity: [
            { date: "2026-04-30", created: 3, published: 2 }
          ],
          topTags: [
            { tag: "scanning", count: 24 },
            { tag: "parcels", count: 18 }
          ]
        }, null, 2),
      },
      {
        method: "GET",
        path: "/api/summary-report",
        auth: "x-api-key OR session",
        description: "Generate a summary report of knowledge base activity since a given date. Returns article counts, duplicate detections, and processing errors. The 'since' parameter is an ISO 8601 date/datetime string. Defaults to 7 days ago if not provided.",
        requestExample: "GET /api/summary-report?since=2026-04-01T00:00:00Z",
        responseExample: JSON.stringify({
          period: {
            since: "2026-04-01T00:00:00Z",
            to: "2026-04-30T23:59:59Z"
          },
          summary: {
            created: 42,
            updated: 18,
            duplicates: 7,
            failed: 3
          },
          articles: [
            {
              id: "art_xyz789",
              title: "Parcel Scanning Procedure",
              status: "published",
              createdAt: "2026-04-15T09:00:00Z"
            }
          ],
          errors: [
            {
              id: "clx1err001",
              type: "pdf",
              error: "Gemini API timeout",
              createdAt: "2026-04-20T14:00:00Z"
            }
          ]
        }, null, 2),
      },
      {
        method: "POST",
        path: "/api/summary-report",
        auth: "x-api-key",
        description: "Trigger a summary report email to the admin address. Requires SMTP to be configured in environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM). Optionally override the recipient address and the reporting period start date.",
        requestExample: JSON.stringify({
          adminEmail: "ops-team@dhl.com",
          since: "2026-04-01T00:00:00Z"
        }, null, 2),
        responseExample: JSON.stringify({
          sent: true,
          to: "ops-team@dhl.com",
          summary: {
            created: 42,
            updated: 18,
            duplicates: 7,
            failed: 3
          }
        }, null, 2),
      },
    ],
  },
];

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold font-mono tracking-wider ${METHOD_COLORS[method] ?? "bg-gray-100 text-gray-600"}`}>
      {method}
    </span>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="mt-3">
      {label && (
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      )}
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="p-8 max-w-5xl">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-dhl-red text-white font-black text-lg px-3 py-1 rounded-lg">DHL</div>
          <h1 className="text-2xl font-bold text-gray-900">API Integration Reference</h1>
        </div>
        <p className="text-gray-500">For UiPath RPA &amp; Third-Party Integration</p>
      </div>

      {/* Auth section */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border-l-4 border-dhl-red">
        <h2 className="text-base font-bold text-gray-900 mb-4">Authentication</h2>
        <p className="text-sm text-gray-600 mb-4">
          This API supports two authentication methods. Choose the one appropriate for your integration:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Method 1 */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded border border-blue-200">METHOD 1</span>
              <span className="text-sm font-semibold text-gray-800">Session Cookie</span>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              For browser-based users authenticated via the login page. The session cookie is set automatically after login and sent with every request.
            </p>
            <p className="text-xs text-gray-400">Used by: Dashboard UI, web-based workflows</p>
          </div>

          {/* Method 2 */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded border border-green-200">METHOD 2</span>
              <span className="text-sm font-semibold text-gray-800">API Key Header</span>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              For machine-to-machine access (UiPath bots, RPA workflows, cron jobs). Include the key in every request header.
            </p>
            <pre className="bg-gray-900 text-green-400 rounded p-2 text-xs font-mono mt-2">
              x-api-key: {"<value of UIPATH_API_KEY env var>"}
            </pre>
            <p className="text-xs text-gray-400 mt-2">Used by: UiPath robots, scheduled jobs, external systems</p>
          </div>
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            <strong>Security note:</strong> The API key is configured via the <code className="bg-yellow-100 px-1 rounded">UIPATH_API_KEY</code> environment variable on the server. Never expose this key in client-side code or version control. Rotate it if compromised.
          </p>
        </div>
      </div>

      {/* Base URL */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-8">
        <h2 className="text-sm font-bold text-gray-900 mb-2">Base URL</h2>
        <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-sm font-mono">
          https://your-deployment-domain.com
        </pre>
        <p className="text-xs text-gray-400 mt-2">All endpoint paths are relative to this base URL. All request/response bodies use JSON unless multipart/form-data is specified.</p>
      </div>

      {/* Quick reference table */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
        <h2 className="text-base font-bold text-gray-900 mb-4">Quick Reference</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Method</th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Path</th>
                <th className="text-left py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {endpointGroups.flatMap(group =>
                group.endpoints.map((ep, i) => (
                  <tr key={`${group.name}-${i}`} className="hover:bg-gray-50">
                    <td className="py-2 pr-4">
                      <MethodBadge method={ep.method} />
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-700">{ep.path}</td>
                    <td className="py-2 text-xs text-gray-500">{ep.description.split(".")[0]}.</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Endpoint groups */}
      {endpointGroups.map((group) => (
        <div key={group.name} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900">{group.name}</h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="space-y-6">
            {group.endpoints.map((ep, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Endpoint header */}
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3 flex-wrap">
                    <MethodBadge method={ep.method} />
                    <code className="text-sm font-mono font-semibold text-gray-800">{ep.path}</code>
                    <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                      Auth: {ep.auth}
                    </span>
                  </div>
                </div>

                {/* Endpoint body */}
                <div className="px-6 py-4">
                  <p className="text-sm text-gray-600 leading-relaxed mb-2">{ep.description}</p>

                  {ep.requestExample && (
                    <CodeBlock
                      label={ep.method === "GET" ? "Example Request" : "Request Body"}
                      code={ep.requestExample}
                    />
                  )}

                  <CodeBlock
                    label="Response"
                    code={ep.responseExample}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* UiPath integration guide */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
        <h2 className="text-base font-bold text-gray-900 mb-4">UiPath Integration Pattern</h2>
        <p className="text-sm text-gray-600 mb-4">
          The recommended end-to-end workflow for UiPath RPA robots ingesting data into this knowledge base:
        </p>
        <ol className="space-y-3">
          {[
            { step: 1, title: "Check for duplicates first", desc: "Call POST /api/duplicate-check with the content hash before uploading. Skip if isDuplicate is true." },
            { step: 2, title: "Ingest the raw input", desc: "Call POST /api/ingest with the content type and body (or file). Save the returned id." },
            { step: 3, title: "Trigger AI processing", desc: "Call POST /api/process with the rawInputId. The API calls Gemini to extract structured article data." },
            { step: 4, title: "Monitor results", desc: "Poll GET /api/ingest?status=pending to check for unprocessed items. Failed items have status=failed." },
            { step: 5, title: "Report activity", desc: "Optionally call POST /api/summary-report to trigger an email digest, or GET /api/summary-report to get stats programmatically." },
          ].map(({ step, title, desc }) => (
            <li key={step} className="flex gap-4">
              <span className="bg-dhl-red text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                {step}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-blue-800 mb-1">Headers for all UiPath requests:</p>
          <pre className="text-xs font-mono text-blue-700">
            {`Content-Type: application/json\nx-api-key: <UIPATH_API_KEY value>`}
          </pre>
        </div>
      </div>

      {/* Error codes */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
        <h2 className="text-base font-bold text-gray-900 mb-4">HTTP Status Codes</h2>
        <div className="space-y-2">
          {[
            { code: "200", color: "text-green-600", label: "OK", desc: "Request succeeded. Response body contains the result." },
            { code: "201", color: "text-green-600", label: "Created", desc: "Resource created successfully (POST endpoints)." },
            { code: "400", color: "text-yellow-600", label: "Bad Request", desc: "Invalid input. Check the request body against the schema above." },
            { code: "401", color: "text-red-600", label: "Unauthorized", desc: "Missing or invalid x-api-key header, or session has expired." },
            { code: "403", color: "text-red-600", label: "Forbidden", desc: "Authenticated but insufficient role for this action." },
            { code: "404", color: "text-red-600", label: "Not Found", desc: "The requested resource (article, raw input) does not exist." },
            { code: "409", color: "text-orange-600", label: "Conflict", desc: "Duplicate detected or invalid status transition attempted." },
            { code: "500", color: "text-red-600", label: "Internal Server Error", desc: "Server-side error. Check server logs. Often indicates Gemini API or database issues." },
          ].map(({ code, color, label, desc }) => (
            <div key={code} className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
              <code className={`font-mono text-sm font-bold w-10 shrink-0 ${color}`}>{code}</code>
              <span className="text-sm font-semibold text-gray-700 w-32 shrink-0">{label}</span>
              <span className="text-sm text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-200">
        <p>DHL Knowledge Base API — Internal documentation. Last updated: May 2026.</p>
        <p className="mt-1">For support, contact the KB system administrator.</p>
      </div>
    </div>
  );
}
