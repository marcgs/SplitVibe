import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { mockUsers } from "@/lib/mock-users";

const isDev = process.env.NODE_ENV === "development";

const providers = isDev
  ? [
      Credentials({
        name: "Mock User",
        credentials: {
          email: { label: "Email", type: "text" },
        },
        async authorize(credentials) {
          const email = credentials?.email as string | undefined;
          if (!email) return null;

          const mock = mockUsers.find((u) => u.email === email);
          if (!mock) return null;

          // Return mock user for JWT - database upsert happens in the API route
          return {
            id: mock.id,
            email: mock.email,
            name: mock.name,
            image: mock.image,
          };
        },
      }),
    ]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
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
