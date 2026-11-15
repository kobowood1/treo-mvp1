import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SessionDetailClient } from "@/components/teacher/SessionDetailClient";

export default async function TeacherSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const session = await auth();
  if (!session || (session.user.role !== Role.TEACHER && session.user.role !== Role.SCHOOL_ADMIN)) {
    redirect("/login");
  }

  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      studentId: true,
      classroomId: true,
      classroom: { select: { schoolId: true, teacherId: true, name: true } },
    },
  });

  if (
    !ps ||
    ps.classroom.schoolId !== session.user.schoolId ||
    (session.user.role === Role.TEACHER && ps.classroom.teacherId !== session.user.id)
  ) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <Link
          href={`/teacher/students/${ps.studentId}`}
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← Student Profile
        </Link>
        <h1 className="text-lg font-bold text-slate-900">Session Detail</h1>
        <span className="text-xs text-slate-400">{ps.classroom.name}</span>
      </header>
      <SessionDetailClient sessionId={sessionId} />
    </main>
  );
}
