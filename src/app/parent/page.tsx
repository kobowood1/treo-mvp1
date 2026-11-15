import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export default async function ParentDashboard() {
  const session = await auth();
  if (!session || session.user.role !== Role.PARENT) redirect("/login");

  const links = await prisma.parentLink.findMany({
    where: { parentId: session.user.id, consentGiven: true },
    include: {
      student: { select: { id: true, firstName: true, lastInitial: true } },
    },
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-bold text-slate-900">Treo — Parent View</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">My Children</h2>

        {links.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No linked students yet. Contact your child's teacher.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {links.map((link) => (
              <a
                key={link.id}
                href={`/parent/students/${link.studentId}`}
                className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-300 transition-colors"
              >
                <p className="font-semibold text-slate-900">
                  {link.student.firstName} {link.student.lastInitial}.
                </p>
                <p className="text-sm text-slate-500 mt-1">View weekly report →</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
