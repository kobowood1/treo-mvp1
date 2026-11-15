import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CreateClassroomButton } from "@/components/teacher/CreateClassroomButton";

export default async function TeacherDashboard() {
  const session = await auth();
  if (!session || session.user.role !== Role.TEACHER) redirect("/login");

  const classrooms = await prisma.classroom.findMany({
    where: { teacherId: session.user.id },
    include: { _count: { select: { enrollments: true, sessions: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Treo — My Classes</h1>
        <span className="text-sm text-slate-500">{session.user.name}</span>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-800">Classrooms</h2>
          <CreateClassroomButton />
        </div>

        {classrooms.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No classrooms yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classrooms.map((c) => (
              <Link
                key={c.id}
                href={`/teacher/classrooms/${c.id}`}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-300 transition-colors group"
              >
                <h3 className="font-semibold text-slate-900 group-hover:text-blue-600">
                  {c.name}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Join code:{" "}
                  <span className="font-mono font-medium">{c.joinCode}</span>
                </p>
                <div className="flex gap-4 mt-2 text-xs text-slate-400">
                  <span>{c._count.enrollments} student{c._count.enrollments !== 1 ? "s" : ""}</span>
                  <span>{c._count.sessions} session{c._count.sessions !== 1 ? "s" : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
