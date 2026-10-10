# LSMFit app: sistema «Calor Kinetic»

Elegido el 2026-10-09 por el dueño: es su diseño de Google Stitch («FitConnect Mobile App UI/UX Design», sistema
«Calor Kinetic System») fusionado con lo que la app ya hacía y con el movimiento de los modelos que se exploraron
(lienzo de referencia: https://claude.ai/artifact/FjfqbTwNmrrwhgo8qk5Wgz, fila «E · Fusión»).

**Fuente de verdad de los valores:** `src/lib/theme.ts`. Las piezas viven en `src/components/` (`ui`, `controls`,
`charts`, `nutrition`, `today`). Una pantalla nueva se arma con ellas; no con estilos sueltos.

## Escena
Una persona en el gimnasio o en la cocina, con el celular en una mano, que quiere anotar lo que comió o ver su
membresía en segundos. Cálido, ordenado y con energía; nada de neón ni de negro con músculos.

## Color
- Lienzo crema `#FDFBF7`, tarjetas blancas con borde de 1 px `#EFECE6` y sombra ambiental hiperdifusa (solo en claro).
- Coral `#C4360C` (oscuro `#E66A3F`) para la acción, la selección y «hoy». Como texto, `brandInk`. Como fondo de acento,
  `brandMuted` (chip activo, cuadritos de icono).
- Macros con colores fijos: proteína coral oscuro, carbohidratos durazno, grasa ámbar, fibra taupe. El agua, azul pizarra.
- Señales (ok, warn, danger, info) siempre con icono y texto.
- El modo oscuro es propio (Stitch solo traía claro): espresso `#15110F`, tarjetas `#1E1916`, sin sombras, con borde.

## Tipografía
- Bricolage Grotesque para títulos y cifras (700; 800 en las cifras protagonistas), con tracking negativo desde 26 px.
- Figtree para la interfaz.
- Toda cifra va con `tabular-nums`.
- Escala en `typeScale`: métrica 48, título 26, título de tarjeta 18, cifra 20, cuerpo 15, secundario 13, mínimo 11.

## Forma
- Radios:
  - tarjetas 18;
  - filas internas 12;
  - controles y botones 10 (alto 46, 52 el de pie de pantalla);
  - hojas inferiores 24 arriba;
  - chips y selectores en píldora.
- Margen lateral 20. Separación entre tarjetas 12 a 16.
- Los iconos van en cuadritos tintados (`IconTile`); los alimentos llevan icono según lo que son (`foodIcon`), nunca
  fotos inventadas.

## Reglas de composición
- **Un solo botón con relleno coral por pantalla.** Inicio: «Registrar comida» (y «Renovar» solo si no puede entrar). Comer: «Registrar». Detalle de alimento: «Agregar
  a …» fijo abajo. El resto es secundario (gris cálido), `TextLink` o ghost.
- **Nada de datos que la app no tiene.** No hay «calorías quemadas», «nivel PRO» ni «cifrado de extremo a extremo».
- **Sin rayas** (— ni –), **sin emoji y sin títulos en mayúsculas.**
- **El aviso sin conexión** solo aparece cuando de verdad no hay señal o hay registros por subir.

## Movimiento (Emil Kowalski)
- **Presión:** todo lo tocable se hunde a 0,97 en 160 ms con ease-out (`Press`).
- **Al montar:** los bloques entran escalonados (`Rise`), los anillos y las barras se llenan en 900 ms y la cifra
  protagonista sube (`Ticker`).
- **Hojas inferiores:** entran con la curva de drawer en 420 ms y salen en 200 ms.
- **Solo transform y opacidad.** Movimiento reducido del sistema: todo aparece sin animar.
- **Sin coreografía al cambiar de pestaña.**

## Cómo se verifica
- `npx tsc --noEmit` y `npm test` en `mobile/`.
- Export web (`npx expo export --platform web`) servido con fallback de SPA. Recorrido con Playwright a 390 × 844 en
  claro y oscuro, con capturas y la detección de desbordes.
