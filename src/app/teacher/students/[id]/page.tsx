import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import Link from "next/link";
import { StudentProfileClient } from "@/components/teacher/StudentProfileClient";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: studentId } = await params;
  const session = await auth();
  if (!session || (session.user.role !== Role.TEACHER && session.user.role !== Role.SCHOOL_ADMIN)) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <Link href="/teacher" className="text-slate-400 hover:text-slate-600 text-sm">← Classes</Link>
        <h1 className="text-lg font-bold text-slate-900">Student Profile</h1>
      </header>
      <StudentProfileClient studentId={studentId} />
    </main>
  );
}
