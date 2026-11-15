import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session || session.user.role !== Role.SCHOOL_ADMIN) redirect("/login");

  const school = await prisma.school.findUnique({
    where: { id: session.user.schoolId },
    include: {
      _count: {
        select: { users: true, classrooms: true },
      },
    },
  });

  const teacherCount = await prisma.user.count({
    where: { schoolId: session.user.schoolId, role: Role.TEACHER },
  });

  const studentCount = await prisma.user.count({
    where: { schoolId: session.user.schoolId, role: Role.STUDENT },
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Treo — School Admin</h1>
        <span className="text-sm text-slate-500">{school?.name}</span>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">School Overview</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Teachers", value: teacherCount },
            { label: "Students", value: studentCount },
            { label: "Classrooms", value: school?._count.classrooms ?? 0 },
            { label: "Total Users", value: school?._count.users ?? 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl border border-slate-200 p-5 text-center"
            >
              <div className="text-3xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-2">Quick Actions</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>• Invite teachers via <strong>/api/invitations</strong></li>
            <li>• View classrooms under each teacher</li>
            <li>• Full analytics dashboard coming in Milestone 6</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
