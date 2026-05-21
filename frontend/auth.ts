import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

class BackendAuthError extends CredentialsSignin {
  constructor(message: string) {
    super(message);
    this.code = message;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new BackendAuthError(err.detail || "Credenciales incorrectas");
        }
        const data = await res.json();
        return {
          id: data.tenant_id,
          email: credentials.email as string,
          name: data.full_name,
          accessToken: data.access_token,
          role: data.role,
          tenantId: data.tenant_id,
          dbName: data.db_name,
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
        const u = user as { accessToken: string; role: string; tenantId: string; dbName: string } & typeof user;
        token.accessToken = u.accessToken;
        token.role = u.role;
        token.tenantId = u.tenantId;
        token.dbName = u.dbName;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.role = token.role as string;
      session.tenantId = token.tenantId as string;
      session.dbName = token.dbName as string;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
