import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ClassroomOverviewClient } from "@/components/teacher/ClassroomOverviewClient";

export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: classroomId } = await params;
  const session = await auth();
  if (!session || (session.user.role !== Role.TEACHER && session.user.role !== Role.SCHOOL_ADMIN)) {
    redirect("/login");
  }

  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, name: true, joinCode: true, teacherId: true, schoolId: true },
  });

  if (
    !classroom ||
    classroom.schoolId !== session.user.schoolId ||
    (session.user.role === Role.TEACHER && classroom.teacherId !== session.user.id)
  ) {
    redirect("/teacher");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/teacher" className="text-slate-400 hover:text-slate-600 text-sm">← Classes</Link>
          <h1 className="text-lg font-bold text-slate-900">{classroom.name}</h1>
          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
            Join code: {classroom.joinCode}
          </span>
        </div>
        <div className="flex gap-3">
          <a
            href={`/api/teacher/classrooms/${classroomId}/export`}
            className="text-sm text-slate-600 hover:text-blue-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:border-blue-300 transition-colors"
          >
            Export CSV
          </a>
        </div>
      </header>
      <ClassroomOverviewClient classroomId={classroomId} />
    </main>
  );
}
