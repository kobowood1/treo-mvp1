"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassroomSummary = {
  id: string;
  name: string;
  teacherName: string | null;
  studentCount: number;
  sessionCount: number;
};

type StrugglingSkill = {
  name: string;
  errorRate: number;
  total: number;
};

type StatsData = {
  teacherCount: number;
  studentCount: number;
  classroomCount: number;
  totalSessions: number;
  weeklySessions: number;
  classrooms: ClassroomSummary[];
  strugglingSkills: StrugglingSkill[];
};

type Teacher = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  _count: { classrooms: number };
};

type PendingInvite = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
};

// ── Invite teacher form ───────────────────────────────────────────────────────

function InviteTeacherForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: "TEACHER" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setResult({ error: data.error ?? "Failed to send invitation." });
    } else {
      setResult({ url: data.inviteUrl });
      setEmail("");
      onInvited();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-3">Invite a Teacher</h3>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="teacher@school.edu"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send Invite"}
        </button>
      </form>
      {result?.error && (
        <p role="alert" className="text-red-600 text-sm mt-2">{result.error}</p>
      )}
      {result?.url && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="text-green-800 text-xs font-medium mb-1">Invitation link (share with teacher):</p>
          <p className="text-green-700 text-xs font-mono break-all">{result.url}</p>
        </div>
      )}
    </div>
  );
}

// ── Main client ────────────────────────────────────────────────────────────────

export function AdminDashboardClient() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [statsRes, teachersRes] = await Promise.all([
      fetch("/api/admin/stats"),
      fetch("/api/admin/teachers"),
    ]);
    if (statsRes.ok) setStats(await statsRes.json());
    if (teachersRes.ok) {
      const d = await teachersRes.json();
      setTeachers(d.teachers ?? []);
      setPending(d.pendingInvites ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: "Teachers", value: stats.teacherCount },
            { label: "Students", value: stats.studentCount },
            { label: "Classrooms", value: stats.classroomCount },
            { label: "All Sessions", value: stats.totalSessions },
            { label: "This Week", value: stats.weeklySessions },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Struggling skills */}
      {stats && stats.strugglingSkills.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Top Struggling Skills School-wide (this week)
          </h2>
          <div className="space-y-2">
            {stats.strugglingSkills.map((skill) => (
              <div key={skill.name} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-56 shrink-0">{skill.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-red-400"
                    style={{ width: `${Math.round(skill.errorRate * 100)}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(skill.errorRate * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={skill.name}
                  />
                </div>
                <span className="text-xs font-mono text-slate-500 w-14 text-right shrink-0">
                  {Math.round(skill.errorRate * 100)}% err · {skill.total} sessions
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Classrooms */}
      {stats && stats.classrooms.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            All Classrooms
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.classrooms.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
                <p className="text-xs text-slate-500 mt-1">{c.teacherName}</p>
                <div className="flex gap-4 text-xs text-slate-400 mt-2">
                  <span>{c.studentCount} students</span>
                  <span>{c.sessionCount} sessions</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite teacher */}
      <InviteTeacherForm onInvited={fetchData} />

      {/* Teacher list */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Teachers ({teachers.length})
        </h2>
        {teachers.length === 0 ? (
          <p className="text-slate-400 text-sm">No teachers yet. Send an invite above.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {teachers.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {t.displayName ?? t.email}
                  </p>
                  {t.displayName && (
                    <p className="text-xs text-slate-400">{t.email}</p>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {t._count.classrooms} classroom{t._count.classrooms !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending invitations */}
      {pending.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Pending Invitations ({pending.length})
          </h2>
          <div className="divide-y divide-slate-100">
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2">
                <p className="text-sm text-slate-600">{inv.email}</p>
                <p className="text-xs text-slate-400">
                  Expires {new Date(inv.expiresAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
