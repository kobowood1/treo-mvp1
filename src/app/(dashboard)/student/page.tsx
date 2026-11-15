import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export default async function StudentDashboard() {
  const session = await auth();
  if (!session || session.user.role !== Role.STUDENT) redirect("/login");

  const recentSessions = await prisma.problemSession.findMany({
    where: { studentId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      problemLatex: true,
      finalAnswerCorrect: true,
      createdAt: true,
    },
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Treo</h1>
        <span className="text-sm text-slate-500">{session.user.name}</span>
      </header>

      <div className="max-w-xl mx-auto px-6 py-8">
        <a
          href="/student/upload"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center rounded-xl py-4 text-base font-semibold transition-colors mb-8"
        >
          + Upload New Problem
        </a>

        <h2 className="text-lg font-semibold text-slate-800 mb-4">Recent Problems</h2>

        {recentSessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">
              No problems yet! Upload a photo to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((s) => (
              <a
                key={s.id}
                href={`/student/sessions/${s.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-blue-300 transition-colors"
              >
                <div>
                  <p className="text-sm text-slate-600 font-mono">
                    {s.problemLatex ? s.problemLatex.slice(0, 40) + "…" : "Processing…"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.finalAnswerCorrect === true
                      ? "bg-green-100 text-green-700"
                      : s.finalAnswerCorrect === false
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {s.finalAnswerCorrect === true
                    ? "Correct"
                    : s.finalAnswerCorrect === false
                    ? "In Progress"
                    : s.status}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
