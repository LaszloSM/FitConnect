# Reglas del proyecto — FitConnect

## Idioma de los commits

**Todos los mensajes de commit deben escribirse en español.**

Esto aplica a cualquier cambio en cualquier parte del repositorio (frontend, backend, infra, docs). No hay excepciones.

**Formato correcto:**
```
feat: agregar módulo de notificaciones con preferencias por usuario
fix: corregir acceso seguro a full_name en MembersClient
refactor: extraer lógica de autenticación a helper compartido
docs: actualizar README con instrucciones de despliegue
```

**Formato incorrecto:**
```
feat: add notification module         ← en inglés
fix: safe full_name access            ← en inglés
```

Usa los prefijos convencionales (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`) pero el mensaje descriptivo siempre en español.

---

## Stack técnico

- **Frontend:** Next.js 16.2.4 App Router + React 19 + TypeScript + Tailwind CSS v4
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (multi-tenant: master DB + tenant DB)
- **Auth:** NextAuth.js v5 (beta) + JWT
- **UI:** Base UI (`@base-ui/react`) — NO es Radix UI. El patrón de composición usa `render` prop, NO `asChild`.
- **Animaciones:** Framer Motion v12
- **Infra:** Docker Compose (local) + AWS ECS/RDS (producción)

## Notas críticas de implementación

### Base UI (dialog, dropdown, etc.)
```tsx
// CORRECTO — patrón render prop
<DialogTrigger render={<Button>Crear</Button>} />

// INCORRECTO — asChild no existe en Base UI
<DialogTrigger asChild><Button>Crear</Button></DialogTrigger>
```

### Next.js 16 — AGENTS.md
Lee `frontend/AGENTS.md` antes de escribir cualquier código Next.js. Esta versión tiene breaking changes respecto a tu data de entrenamiento.

### Framer Motion v12
```tsx
// CORRECTO — type Variants importado explícitamente
import { motion, type Variants } from "framer-motion";
const variants: Variants = { hidden: {}, visible: {} };

// transition NO va dentro de los variants — ponlo en el motion element
<motion.div variants={variants} transition={{ duration: 0.35 }} />
```

---

## Graphify — Mapa del proyecto

Usamos [graphify](https://github.com/safishamsi/graphify) para generar un knowledge graph del repo y evitar releer todo el código en cada sesión.

**Setup (una sola vez):**
```bash
uv tool install graphifyy
graphify install   # registra en Claude Code
```

**Uso habitual:**
```bash
graphify .                              # genera el grafo del proyecto
graphify query "autenticación tenants"  # búsqueda semántica
graphify path "AuthMiddleware" "MemberRouter"  # traza conexiones
```

Antes de explorar código desconocido, ejecuta `graphify query "<concepto>"` para ubicarte sin leer archivos manualmente.

---

## Aprendizaje de errores

Cuando cometas un error durante una sesión, agrégalo aquí antes de terminar:

| Error | Causa | Regla aprendida |
|-------|-------|-----------------|
| `DialogTrigger asChild` rompía en Base UI | Base UI usa `render` prop, no Radix UI | Siempre usar `render={<Component />}` |
| `type Variants` no importado | Framer Motion v12 requiere import explícito | `import { motion, type Variants } from "framer-motion"` |
| imports sin uso en Dashboard | React 19 es estricto con tree-shaking | Revisar imports al terminar cada archivo |
| `z.record(z.boolean())` TS error | Zod strict requiere key schema explícito | Siempre `z.record(z.string(), z.boolean())` |
| Colores shadcn (`text-muted-foreground`, `bg-popover`) en componentes | Este proyecto usa CSS vars propios, NO shadcn | Usar `var(--text-muted)`, `var(--bg-card)`, etc. Nunca tokens shadcn |
| `border-l-4` en banners/alertas | Violación de impeccable: side-stripe border baneado | Usar `bg-amber-50 dark:bg-amber-950/20 border border-amber-200` |
| `LinearGradient` id duplicado en SVGs | Múltiples SVGs con mismo id causan conflicto visual | Usar `useId()` de React para ids únicos en SVGs inline |

**Protocolo:** Al detectar un error que no estaba documentado, añade una fila a la tabla antes del commit.

---

## Preferencias del usuario

- **Idioma de respuesta:** español (código en inglés, comunicación en español)
- **Estilo de código:** sin comentarios salvo que el WHY sea no obvio; sin abstracciones prematuras
- **Commits:** español, convencionales (`feat`, `fix`, `refactor`…) — ver sección arriba
- **UI:** premium, dark mode first, Framer Motion para animaciones de entrada (stagger en listas)
- **Respuestas:** concisas — sin repetir lo que el usuario ya sabe, sin resúmenes al final
- **CLAUDE.md como documento vivo:** actualizar al final de cada sesión con errores encontrados o reglas nuevas que funcionen

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
