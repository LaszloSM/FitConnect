export { auth as proxy } from "@/auth";

export const config = {
  // Excluir API, assets de Next, login/register y cualquier archivo estático
  // con extensión (logos, imágenes, fuentes) servido desde /public. La imagen
  // para compartir en redes no lleva extensión y la piden bots sin sesión.
  matcher: [
    // `$` en la negación deja pasar la raíz `/` (landing pública)
    "/((?!api|_next/static|_next/image|favicon.ico|login|register|aceptar-invitacion|recuperar|restablecer|completar|kiosk|screen|reportar|diseno|opengraph-image|privacidad|terminos|tratamiento-datos|app$|app/|$|.*\\.[\\w]+$).*)",
  ],
};
