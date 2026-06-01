export { auth as middleware } from "@/auth";

export const config = {
  // Excluir API, assets de Next, login/register y cualquier archivo estático
  // con extensión (logos, imágenes, fuentes) servido desde /public.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|register|.*\\.[\\w]+$).*)",
  ],
};
