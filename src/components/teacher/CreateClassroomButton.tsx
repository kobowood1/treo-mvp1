"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateClassroomButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/classrooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create classroom.");
      return;
    }
    setOpen(false);
    setName("");
    router.refresh();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      >
        + New Classroom
      </button>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Classroom name (e.g. Algebra 1 — Period 3)"
        autoFocus
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
      >
        {loading ? "Creating…" : "Create"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(""); setError(""); }}
        className="text-sm text-slate-400 hover:text-slate-600"
      >
        Cancel
      </button>
      {error && <span className="text-red-600 text-sm">{error}</span>}
    </form>
  );
}
