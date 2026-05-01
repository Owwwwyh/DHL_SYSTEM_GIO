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

        return { id: user.id, email: user.email, name: user.name ?? "", role: user.role, isActive: user.isActive };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.isActive = (user as { isActive?: boolean }).isActive;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string; role?: string; isActive?: boolean }).id = token.id as string;
        (session.user as { id?: string; role?: string; isActive?: boolean }).role = token.role as string;
        (session.user as { id?: string; role?: string; isActive?: boolean }).isActive = token.isActive as boolean;
      }
      return session;
    },
  },
};
