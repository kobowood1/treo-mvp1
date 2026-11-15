/**
 * Auth.js v5 configuration
 * Supports:
 *  - Credentials provider for email/password (admin, teacher, parent)
 *  - Credentials provider for student class-code + username + PIN login
 */

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";

// ─── Validation schemas ───────────────────────────────────────────────────────

const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const studentLoginSchema = z.object({
  classCode: z.string().min(1),
  username: z.string().min(1),
  pin: z.string().min(1),
});

// ─── Auth configuration ───────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    // Email + password for admin, teacher, parent
    CredentialsProvider({
      id: "email-password",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = emailLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findFirst({
          where: {
            email,
            role: { in: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.PARENT] },
          },
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            schoolId: true,
            passwordHash: true,
          },
        });

        if (!user?.passwordHash) return null;
        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email ?? "",
          name: user.displayName ?? "",
          role: user.role,
          schoolId: user.schoolId,
        };
      },
    }),

    // Class code + username + PIN for students
    CredentialsProvider({
      id: "student-login",
      name: "Student Login",
      credentials: {
        classCode: { label: "Class Code", type: "text" },
        username: { label: "Username", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        const parsed = studentLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { classCode, username, pin } = parsed.data;

        // Find classroom by join code
        const classroom = await prisma.classroom.findUnique({
          where: { joinCode: classCode },
          select: { id: true, schoolId: true },
        });
        if (!classroom) return null;

        // Find student in that school
        const student = await prisma.user.findFirst({
          where: {
            schoolId: classroom.schoolId,
            username,
            role: Role.STUDENT,
            enrollments: { some: { classroomId: classroom.id } },
          },
          select: {
            id: true,
            username: true,
            firstName: true,
            lastInitial: true,
            role: true,
            schoolId: true,
            pinHash: true,
          },
        });

        if (!student?.pinHash) return null;
        const valid = await compare(pin, student.pinHash);
        if (!valid) return null;

        return {
          id: student.id,
          email: "",
          name: `${student.firstName ?? ""} ${student.lastInitial ?? ""}`.trim(),
          role: student.role,
          schoolId: student.schoolId,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // user is the object returned from authorize()
        token.id = user.id ?? "";
        token.role = (user as { role: Role }).role;
        token.schoolId = (user as { schoolId: string }).schoolId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.schoolId = token.schoolId as string;
      }
      return session;
    },
  },
});
