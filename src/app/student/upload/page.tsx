"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type FileEntry = { file: File; previewUrl: string };

export default function StudentUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [workStatus, setWorkStatus] = useState<"complete" | "stuck">("complete");
  const [classroomId, setClassroomId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Fetch student's classrooms on mount
  const [classrooms, setClassrooms] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(true);

  useState(() => {
    fetch("/api/classrooms")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setClassrooms(data);
          if (data.length === 1) setClassroomId(data[0].id);
        }
      })
      .finally(() => setLoadingClassrooms(false));
  });

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const entries: FileEntry[] = [];
    for (const file of Array.from(newFiles)) {
      if (files.length + entries.length >= 3) break;
      entries.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setFiles((prev) => [...prev, ...entries].slice(0, 3));
  }, [files.length]);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) { setError("Please add at least one photo."); return; }
    if (!classroomId) { setError("Please select a class."); return; }

    setError("");
    setUploading(true);

    const formData = new FormData();
    formData.append("classroomId", classroomId);
    formData.append("workStatus", workStatus);
    files.forEach(({ file }) => formData.append("images[]", file));

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    // Navigate to confirmation page
    router.push(`/student/sessions/${data.sessionId}`);
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <a href="/student" className="text-slate-400 hover:text-slate-600 text-sm">← Back</a>
        <h1 className="text-lg font-bold text-slate-900">Upload Your Work</h1>
      </header>

      <div className="max-w-xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Class selector */}
          {!loadingClassrooms && classrooms.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Which class is this for?
              </label>
              <select
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a class…</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Work status */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">How far did you get?</p>
            <div className="flex gap-3">
              {(["complete", "stuck"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setWorkStatus(status)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    workStatus === status
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  {status === "complete" ? "I finished it" : "I got stuck"}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Photos of your work ({files.length}/3)
            </p>
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop images here or click to browse"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="text-4xl mb-2" aria-hidden="true">📸</div>
              <p className="text-slate-600 text-sm">
                Drag &amp; drop photos here, or <span className="text-blue-600 font-medium">browse</span>
              </p>
              <p className="text-slate-400 text-xs mt-1">
                JPEG, PNG, or HEIC — max 10 MB each
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              aria-hidden="true"
            />
          </div>

          {/* Image previews */}
          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {files.map(({ previewUrl }, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-lg overflow-hidden border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={`Page ${i + 1} of your work`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-black/80"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={uploading || files.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-base font-semibold transition-colors disabled:opacity-60"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                Reading your work…
              </span>
            ) : (
              "Get Feedback"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
