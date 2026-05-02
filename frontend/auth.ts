import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
          id: data.tenant_id,
          email: credentials.email as string,
          name: data.full_name,
          accessToken: data.access_token,
          role: data.role,
          tenantId: data.tenant_id,
        };
      },
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as { accessToken: string; role: string; tenantId: string } & typeof user;
        token.accessToken = u.accessToken;
        token.role = u.role;
        token.tenantId = u.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.role = token.role as string;
      session.tenantId = token.tenantId as string;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
