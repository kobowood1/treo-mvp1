import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

export default async function DashboardRootPage() {
  const session = await auth();
  if (!session) redirect("/login");

  switch (session.user.role) {
    case Role.SCHOOL_ADMIN:
      redirect("/admin");
    case Role.TEACHER:
      redirect("/teacher");
    case Role.STUDENT:
      redirect("/student");
    case Role.PARENT:
      redirect("/parent");
    default:
      redirect("/login");
  }
}
