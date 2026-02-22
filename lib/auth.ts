import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { mockUsers } from "@/lib/mock-users";

const isDev = process.env.NODE_ENV === "development";

const mockProvider = Credentials({
  name: "Mock User",
  credentials: {
    email: { label: "Email", type: "text" },
  },
  async authorize(credentials) {
    const email = credentials?.email as string | undefined;
    if (!email) return null;

    const mock = mockUsers.find((u) => u.email === email);
    if (!mock) return null;

    // Upsert the user so a DB row always exists
    const user = await db.user.upsert({
      where: { email: mock.email },
      update: { name: mock.name, image: mock.image },
      create: {
        id: mock.id,
        email: mock.email,
        name: mock.name,
        image: mock.image,
      },
    });

    return user;
  },
});

const providers = [
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
      ]
    : []),
  ...(isDev ? [mockProvider] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
