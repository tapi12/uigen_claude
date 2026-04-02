# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) al trabajar con el código de este repositorio.

## Comandos

```bash
npm run setup        # Configuración inicial: instala dependencias, genera cliente Prisma y ejecuta migraciones
npm run dev          # Inicia el servidor de desarrollo (Turbopack) en http://localhost:3000
npm run build        # Build de producción
npm run lint         # Revisión con ESLint
npm run test         # Ejecuta todos los tests con Vitest
npx vitest run src/lib/__tests__/file-system.test.ts  # Ejecutar un solo archivo de test
npm run db:reset     # Reiniciar la base de datos SQLite
```

Variables de entorno (`.env`):
- `ANTHROPIC_API_KEY` — opcional; si no se define, cae en un generador estático de mocks
- `JWT_SECRET` — opcional; por defecto usa una clave de desarrollo

## Arquitectura

UIGen es un generador de componentes React impulsado por IA. Los usuarios describen una UI en el chat, Claude genera/edita archivos, y una vista previa en iframe se recarga automáticamente.

### Flujo de datos

```
Entrada del chat → useChat() (Vercel AI SDK) → POST /api/chat
    → streamText() con Claude + herramientas (str_replace_editor, file_manager)
    → resultados de las tool calls llegan al cliente en streaming
    → FileSystemContext aplica los cambios al VirtualFileSystem
    → PreviewFrame detecta cambios en archivos → transformación JSX → recarga del iframe
```

### Abstracciones principales

**VirtualFileSystem** (`src/lib/file-system.ts`) — Sistema de archivos en memoria basado en árbol. Todo el acceso a archivos pasa por esta clase; nada se escribe en disco. Se serializa a JSON para persistencia en base de datos.

**Herramientas de IA** (`src/lib/tools/`) — Dos herramientas expuestas a Claude:
- `str_replace_editor`: crear/ver/reemplazar/insertar en archivos
- `file_manager`: operaciones sobre archivos y directorios

**JSX Transformer** (`src/lib/transform/jsx-transformer.ts`) — Usa Babel standalone para convertir JSX/TSX a JS, construye un import map apuntando a `esm.sh` para paquetes (react, lucide-react, etc.) y devuelve un HTML completo para el iframe.

**Proveedor de IA** (`src/lib/provider.ts`) — Envuelve `@ai-sdk/anthropic` (claude-haiku-4-5). Si no hay API key, `MockLanguageModel` genera componentes de ejemplo estáticos.

**Chat API** (`src/app/api/chat/route.ts`) — Recibe mensajes + sistema de archivos serializado, llama a `streamText()`, y al finalizar persiste los datos del proyecto si el usuario está autenticado.

### Gestión de estado

Dos contextos de React gestionan el estado global:
- **FileSystemContext** (`src/lib/contexts/file-system-context.tsx`) — Posee la instancia de `VirtualFileSystem`, ejecuta las tool calls de IA y rastrea el archivo seleccionado.
- **ChatContext** (`src/lib/contexts/chat-context.tsx`) — Envuelve `useChat()` del Vercel AI SDK y reenvía el estado del sistema de archivos a `/api/chat`.

Ambos contextos se proveen en `MainContent` (`src/app/main-content.tsx`), que renderiza el layout de 3 paneles: Chat (izquierda) | pestañas Preview/Code (derecha).

### Autenticación y persistencia

- Sesiones JWT almacenadas en cookies HTTP-only, gestionadas en `src/lib/auth.ts` (usa `jose`).
- El middleware (`src/middleware.ts`) valida sesiones para rutas protegidas.
- Las server actions en `src/actions/` manejan registro/inicio de sesión/cierre de sesión y CRUD de proyectos.
- Base de datos SQLite en `prisma/dev.db`; cliente generado en `src/generated/prisma/`.

**Modelos Prisma:**

- **User**: `id` (cuid), `email` (único), `password` (hash bcrypt), timestamps. Relación 1:N con proyectos.
- **Project**: `id` (cuid), `name`, `userId` (nullable — proyectos anónimos tienen `userId: null`), `messages` (JSON string, historial del chat), `data` (JSON string, estado del `VirtualFileSystem`), timestamps. `onDelete: Cascade` al borrar el usuario.

Los campos `messages` y `data` son strings JSON (`@default("[]")` y `@default("{}")`) porque SQLite no tiene tipo JSON nativo. Al cargar un proyecto, se deserializan para reconstruir el historial de chat y el sistema de archivos en memoria.

### Rutas

- `/` — Inicio; redirige a usuarios autenticados a su último proyecto o crea uno nuevo; muestra la UI anónima en caso contrario.
- `/[projectId]` — Vista de proyecto autenticada; carga el estado del proyecto desde la BD y lo pasa a `MainContent`.

### Componentes de UI

- `src/components/ui/` — Primitivas de shadcn/ui (basadas en Radix UI, estilo "new-york").
- `src/components/chat/` — Interfaz de chat, lista de mensajes, renderizador de Markdown, input de mensajes.
- `src/components/editor/` — Editor Monaco + árbol de archivos.
- `src/components/preview/` — PreviewFrame (iframe con hot-reload).
