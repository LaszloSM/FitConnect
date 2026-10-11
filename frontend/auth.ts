import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

class BackendAuthError extends CredentialsSignin {
  constructor(message: string) {
    super(message);
    this.code = message;
  }
}

const API_URL = () => process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Vence el token del backend (8 h por defecto). Cuando queda menos de esto, se renueva. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

/** Lee el `exp` del JWT sin verificarlo: solo sirve para saber cuándo renovar. */
function expiryOf(accessToken: string): number {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  // La sesión dura lo mismo que el token del backend y se extiende mientras la
  // persona use la app. Antes la cookie vivía 30 días sobre un token de 8 h: la
  // app parecía conectada y todo respondía 401.
  session: { strategy: "jwt", maxAge: 60 * 60 * 8, updateAge: 60 * 15 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        challenge_token: { type: "text" },
        code: { type: "text" },
        method: { type: "text" },
        credential: { type: "text" },
      },
      async authorize(credentials) {
        const apiUrl = API_URL();
        const post = (path: string, body: unknown) =>
          fetch(`${apiUrl}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        let res: Response;
        if (credentials.challenge_token) {
          // Segundo paso: app autenticadora, código por correo, llave de acceso o respaldo.
          const method = credentials.method ? String(credentials.method) : undefined;
          res = await post("/api/v1/auth/mfa/verify", {
            challenge_token: credentials.challenge_token,
            code: String(credentials.code ?? "").replace(/\s/g, ""),
            method,
            credential: credentials.credential ? JSON.parse(String(credentials.credential)) : undefined,
          });
        } else {
          // El owner entra por /auth/login; el staff (admin/recepción) por
          // /auth/staff/login. Probamos owner primero y caemos a staff.
          const body = { email: credentials.email, password: credentials.password };
          res = await post("/api/v1/auth/login", body);
          if (!res.ok && res.status !== 403 && res.status !== 429) {
            res = await post("/api/v1/auth/staff/login", body);
          }
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new BackendAuthError(err.detail || "Credenciales incorrectas");
        }
        const data = await res.json();
        if (data.challenge_token) {
          // La página de login lee el prefijo y ofrece los métodos del segundo paso.
          const step = { t: data.challenge_token, m: data.methods ?? ["totp"], p: data.preferred ?? null, e: data.email_hint ?? null };
          throw new BackendAuthError(`mfa:${Buffer.from(JSON.stringify(step)).toString("base64url")}`);
        }
        return {
          id: data.tenant_id,
          email: (credentials.email as string) || "",
          name: data.full_name,
          accessToken: data.access_token,
          role: data.role,
          tenantId: data.tenant_id,
          dbName: data.db_name,
          // Las capacidades las decide el backend y viajan con el login: la UI
          // no mantiene su propia copia de la matriz, que se desincronizaría.
          permissions: (data.permissions ?? []) as string[],
          mfaSetupRequired: Boolean(data.mfa_setup_required),
        };
      },
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session?.accessToken) {
        // Tras activar la verificación en dos pasos el backend entrega una sesión
        // completa; la reemplaza aquí sin pedir la contraseña otra vez.
        const s = session as { accessToken: string; permissions?: string[] };
        token.accessToken = s.accessToken;
        if (s.permissions) token.permissions = s.permissions;
        token.accessTokenExpires = expiryOf(s.accessToken);
        token.mfaSetupRequired = false;
        delete token.error;
        return token;
      }
      if (user) {
        const u = user as {
          accessToken: string; role: string; tenantId: string; dbName: string; permissions?: string[]; mfaSetupRequired?: boolean;
        } & typeof user;
        token.mfaSetupRequired = Boolean(u.mfaSetupRequired);
        token.accessToken = u.accessToken;
        token.role = u.role;
        token.tenantId = u.tenantId;
        token.dbName = u.dbName;
        token.permissions = u.permissions ?? [];
        token.accessTokenExpires = expiryOf(u.accessToken);
        delete token.error;
        return token;
      }

      const expires = (token.accessTokenExpires as number) || 0;
      if (!token.accessToken || !expires) return token;
      if (Date.now() < expires - REFRESH_MARGIN_MS) return token;

      // Renovación silenciosa: mientras la persona use la app nunca la echa fuera.
      try {
        const res = await fetch(`${API_URL()}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.accessToken as string}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        token.accessToken = data.access_token;
        token.role = data.role;
        token.dbName = data.db_name;
        // Un cambio de rol se aplica al renovar, sin obligar a cerrar sesión.
        if (data.permissions) token.permissions = data.permissions;
        if (data.tenant_id) token.tenantId = data.tenant_id;
        token.accessTokenExpires = expiryOf(data.access_token);
        delete token.error;
      } catch {
        // El token ya no sirve: se marca para que el dashboard cierre sesión con
        // un aviso, en vez de dejar la pantalla llena de "Error cargando...".
        token.error = "RefreshFailed";
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.role = token.role as string;
      session.permissions = (token.permissions as string[]) ?? [];
      session.tenantId = token.tenantId as string;
      session.dbName = token.dbName as string;
      session.error = token.error as string | undefined;
      session.mfaSetupRequired = Boolean(token.mfaSetupRequired);
      return session;
    },
  },
  events: {
    // Cerrar sesión de verdad: el backend invalida el token aunque no haya vencido.
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      const access = token?.accessToken as string | undefined;
      if (!access) return;
      await fetch(`${API_URL()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => undefined);
    },
  },
  pages: { signIn: "/login" },
});
