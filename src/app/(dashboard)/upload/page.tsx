"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const INPUT_TYPES = [
  { value: "email",      label: "Email Thread",       icon: "📧", accept: ".txt,.eml" },
  { value: "chat",       label: "Chat / Teams",        icon: "💬", accept: ".txt" },
  { value: "screenshot", label: "Screenshot",          icon: "🖼️", accept: "image/*" },
  { value: "pdf",        label: "PDF Document",        icon: "📄", accept: ".pdf" },
  { value: "docx",       label: "Word Document",       icon: "📝", accept: ".docx,.doc" },
  { value: "note",       label: "Handwritten Note",    icon: "✍️", accept: ".txt" },
  { value: "powerpoint", label: "Training Material",   icon: "📊", accept: ".txt,.pptx" },
];

export default function UploadPage() {
  const router = useRouter();
  const [type, setType] = useState("email");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<"form" | "processing" | "done" | "duplicate" | "error">("form");
  const [articleId, setArticleId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const currentType = INPUT_TYPES.find((t) => t.value === type)!;
  const isFileType = ["screenshot", "pdf", "docx"].includes(type);
  const needsText = !isFileType || type === "screenshot";

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep("processing");

    try {
      const form = new FormData();
      form.append("type", type);
      form.append("content", content);
      if (file) form.append("file", file);

      const ingestRes = await fetch("/api/ingest", { method: "POST", body: form });
      const ingestData = await ingestRes.json();

      if (ingestData.isDuplicate) {
        setStep("duplicate");
        return;
      }

      if (!ingestRes.ok) throw new Error(ingestData.error);

      const processRes = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInputId: ingestData.id }),
      });
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error);

      setArticleId(processData.article.id);
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred");
      setStep("error");
    }
  }

  if (step === "processing") return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-6xl mb-4">🤖</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Gemini AI is processing...</h2>
        <p className="text-gray-500">Generating title, summary, steps, tags and related links.</p>
        <div className="mt-4 flex justify-center gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 bg-dhl-red rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );

  if (step === "duplicate") return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">⏭️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Duplicate Detected</h2>
        <p className="text-gray-500 mb-6">This content was already ingested within the last 14 days. Skipping to avoid duplicates in the knowledge base.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => router.push("/articles")} className="bg-dhl-red text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700">
            View Articles
          </button>
          <button onClick={() => { setStep("form"); setContent(""); setFile(null); }} className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-200">
            Upload Different Content
          </button>
        </div>
      </div>
    </div>
  );

  if (step === "done") return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Draft Article Created!</h2>
        <p className="text-gray-500 mb-6">AI has generated a structured SOP article. Review and edit it before submitting for review.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => router.push(`/articles/${articleId}`)} className="bg-dhl-red text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700">
            Review Draft
          </button>
          <button onClick={() => { setStep("form"); setContent(""); setFile(null); }} className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-200">
            Upload Another
          </button>
        </div>
      </div>
    </div>
  );

  if (step === "error") return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Processing Failed</h2>
        <p className="text-red-500 mb-6 text-sm bg-red-50 p-3 rounded-lg">{errorMsg}</p>
        <button onClick={() => setStep("form")} className="bg-dhl-red text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700">
          Try Again
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Raw Input</h1>
        <p className="text-gray-500 mt-1">Upload any format — AI converts it to a structured SOP article.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-2">
          {/* Input type selector */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">1. Select Input Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {INPUT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setType(t.value); setFile(null); setContent(""); }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    type === t.value
                      ? "border-dhl-red bg-red-50 text-dhl-red"
                      : "border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-xs text-center leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* File + content */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <label className="block text-sm font-semibold text-gray-700">2. Provide Content</label>

            {isFileType && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-dhl-red bg-red-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept={currentType.accept}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div>
                    <span className="text-3xl">📎</span>
                    <p className="font-medium text-gray-800 mt-2">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-3xl">{currentType.icon}</span>
                    <p className="text-gray-600 mt-2 font-medium">Drop your file here or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Supported: {currentType.accept}</p>
                  </div>
                )}
              </div>
            )}

            {needsText && (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={isFileType ? 4 : 12}
                required={!isFileType}
                placeholder={
                  type === "screenshot"
                    ? "Optional: describe what this screenshot shows or add context..."
                    : type === "email"
                    ? "Paste the full email thread here..."
                    : type === "chat"
                    ? "Paste the Teams/Telegram chat conversation..."
                    : type === "powerpoint"
                    ? "Paste training slide content or key points..."
                    : "Type or paste the content here..."
                }
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dhl-red resize-none text-sm text-gray-700 placeholder-gray-300"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={isFileType && !file && !content}
            className="w-full bg-dhl-red text-white py-3.5 rounded-xl font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🚀 Convert to SOP Article with AI
          </button>
        </form>

        {/* Right-hand info panel */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span>🤖</span> How it works
            </h3>
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="bg-dhl-red text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">1</span>
                <span>Pick the input type and paste content or drop a file.</span>
              </li>
              <li className="flex gap-2">
                <span className="bg-dhl-red text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">2</span>
                <span>System hashes the content and skips it if seen in the last 14 days.</span>
              </li>
              <li className="flex gap-2">
                <span className="bg-dhl-red text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">3</span>
                <span>Gemini AI extracts title, summary, steps, tags &amp; related links.</span>
              </li>
              <li className="flex gap-2">
                <span className="bg-dhl-red text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">4</span>
                <span>Article lands in <strong>Drafts</strong> for your review.</span>
              </li>
            </ol>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span>📎</span> Supported formats
            </h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex justify-between"><span>📄 PDF</span><span className="text-gray-400 text-xs">.pdf</span></li>
              <li className="flex justify-between"><span>📝 Word</span><span className="text-gray-400 text-xs">.docx, .doc</span></li>
              <li className="flex justify-between"><span>🖼️ Screenshot</span><span className="text-gray-400 text-xs">.png, .jpg</span></li>
              <li className="flex justify-between"><span>📧 Email</span><span className="text-gray-400 text-xs">.txt, .eml</span></li>
              <li className="flex justify-between"><span>💬 Chat</span><span className="text-gray-400 text-xs">.txt</span></li>
              <li className="flex justify-between"><span>📊 Slides</span><span className="text-gray-400 text-xs">.txt, .pptx</span></li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
            <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
              <span>💡</span> Tips for best results
            </h3>
            <ul className="text-sm text-blue-800 space-y-1.5 list-disc list-inside">
              <li>Include sender / context lines for emails.</li>
              <li>Number any explicit steps you already have.</li>
              <li>Screenshots: add a one-line description of the screen.</li>
              <li>Long PDFs: break into focused sections for cleaner SOPs.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
