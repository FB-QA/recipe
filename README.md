# Romy's Kitchen

A mobile-first recipe app: keep every recipe you love in one place you can cook
from, and — the point of the whole thing — **import recipes from Instagram and
the web** instead of screenshotting them into ChatGPT.

Built for a real user (Romy) with a real workflow to beat: screenshot → ChatGPT
→ paste into Notes.

## Stack

- **Next.js 16** (App Router, Server Actions) · **TypeScript** · **Tailwind v4**
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- **Framer Motion** for transitions · **sharp** for image optimisation
- **Vitest** (unit) · **Playwright** (E2E)

## Local development

Prerequisites: Node 20+, pnpm, Docker (for the local Supabase stack).

```bash
pnpm install
supabase start                       # boots Postgres + Auth + Storage locally
supabase db reset                    # applies migrations
pnpm dev                             # http://localhost:3000
```

`.env.local` points at the local Supabase stack (created by `supabase start`).
Server-only secrets live in `.env` (git-ignored) and are read by Server Actions:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (RLS-gated) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only admin tasks |
| `ANTHROPIC_API_KEY` | AI recipe extraction (Haiku) |
| `APIFY_API_TOKEN` | Instagram retrieval (see below) |

## Deploying to the cloud Supabase project

The cloud project is linked (`supabase link`). To ship the schema:

```bash
supabase db push                     # pushes migrations to the linked project
```

Then set the production env vars (the cloud project's URL + anon key, the
service-role key, and the AI/Apify keys) in your host (e.g. Vercel), and deploy.

## Tests

```bash
pnpm test          # unit (Vitest)
pnpm test:e2e      # E2E against the local Supabase stack (Playwright)
pnpm typecheck && pnpm lint && pnpm build
```

E2E covers the real journeys: auth, recipe CRUD + image upload, website import
(via a local JSON-LD fixture — no external calls), and grocery lists. The
Instagram path is smoke-tested live separately (it costs a fraction of a cent).

## Architecture

```
src/
  app/                      routes (App Router)
    (auth)/                 login, signup, reset — public
    (app)/                  the app shell (bottom nav) — auth-gated
    auth/                   email confirm + OAuth callback route handlers
  components/               UI (design-system primitives, recipes, grocery, import)
  lib/
    supabase/               browser + server clients, generated DB types
    recipes/                queries, actions, validation schema
    import/                 extraction pipeline (see below)
    images/                 sharp optimisation
supabase/migrations/        schema + RLS (one file per concern)
docs/design/v1-core/        the design record (frame -> validate) + prototype
docs/spikes/                the import risk-spike findings
```

### The import pipeline (`src/lib/import/`)

Cheapest rung first, providers kept swappable:

1. **Website** — parse `schema.org/Recipe` JSON-LD deterministically (free).
2. **AI text** — fall back to Haiku over the page text / caption (~0.2¢).
3. **Instagram** — Apify retrieves the Reel caption + media, then AI extracts.

Instagram retrieval (`apify.ts`) is an **isolated, circuit-breakered, fail-soft
leaf** — a paid third-party scraper against Meta's ToS. It returns `null` on any
failure so the rest of the app never depends on it. When the recipe is in the
video rather than the caption, the UI degrades gracefully to a "recipe's in the
video" fallback. **Apify is the V1 choice; revisit it** — the DIY headless
approach was evaluated and parked (`docs/spikes/`).

Every import records its method + estimated cost in `recipe_imports`, which also
caches results and backs a per-user daily rate limit.
