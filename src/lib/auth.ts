import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        if (!user.isActive) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? "",
          role: user.role,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.isActive = (user as { isActive?: boolean }).isActive;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword;
      }
      // After the user updates their password the client calls
      // `update()` from next-auth's useSession; refresh the flag from DB so
      // downstream gates re-evaluate without forcing a fresh login.
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { mustChangePassword: true, isActive: true, role: true },
        });
        if (fresh) {
          token.mustChangePassword = fresh.mustChangePassword;
          token.isActive = fresh.isActive;
          token.role = fresh.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        type S = { id?: string; role?: string; isActive?: boolean; mustChangePassword?: boolean };
        (session.user as S).id = token.id as string;
        (session.user as S).role = token.role as string;
        (session.user as S).isActive = token.isActive as boolean;
        (session.user as S).mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },
};
