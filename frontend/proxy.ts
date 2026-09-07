export { auth as proxy } from "@/auth";

export const config = {
  // Excluir API, assets de Next, login/register y cualquier archivo estático
  // con extensión (logos, imágenes, fuentes) servido desde /public.
  matcher: [
    // `$` en la negación deja pasar la raíz `/` (landing pública)
    "/((?!api|_next/static|_next/image|favicon.ico|login|register|aceptar-invitacion|kiosk|screen|privacidad|terminos|tratamiento-datos|$|.*\\.[\\w]+$).*)",
  ],
};
