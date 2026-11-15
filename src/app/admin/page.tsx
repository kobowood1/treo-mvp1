import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session || session.user.role !== Role.SCHOOL_ADMIN) redirect("/login");

  const school = await prisma.school.findUnique({
    where: { id: session.user.schoolId },
    select: { id: true, name: true },
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Treo — School Admin</h1>
          <p className="text-sm text-slate-500">{school?.name}</p>
        </div>
      </header>
      <AdminDashboardClient />
    </main>
  );
}
