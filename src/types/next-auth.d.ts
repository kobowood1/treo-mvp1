// Extend next-auth types to include role and schoolId
import { Role } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      schoolId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    schoolId: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    schoolId: string;
  }
}
