# Cookdex

**Save it. Cook it.**

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

## CI — Claude reviews every PR

Two workflows in `.github/workflows/`:

- **`claude-code-review.yml`** — reviews every non-draft PR when it opens and on
  each push to it. Comments only; it has `contents: read`.
- **`claude.yml`** — answers `@claude` in a PR comment, review comment or issue.
  This one has `contents: write`, because *"@claude fix that"* means pushing a
  commit.

Both run on the **Claude subscription**, not an API key — the action input is
`claude_code_oauth_token`, so there is no per-token API billing.

Setup is already done and needs no repeating, but for the record it was two
things, neither of which an agent can do:

1. The **Claude GitHub App** installed on this repo.
2. The repo secret **`CLAUDE_CODE_OAUTH_TOKEN`**, minted with `claude setup-token`.

> **The token expires in July 2027.** It is a one-year OAuth token and it does
> **not** auto-rotate. When it lapses, every PR goes red until someone re-runs
> `claude setup-token` and resets the secret.

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
    version/                deploy-skew recovery (see Client resilience)
    nav/                    in-app history position tracking (Back control)
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

### Client resilience (`src/lib/version/`, `src/lib/nav/`)

Two navigation patterns that are each easy to get subtly wrong — the full reasoning
lives in the code comments; the short of it:

- **Deploy-skew recovery** (`version/`) — a long-lived client (PWA, old tab) holds the
  build it first loaded; after a deploy its RSC / Server-Action ids no longer match the
  live deployment and it throws. The middleware stamps the live build on an
  `x-app-version` response header; `VersionManager` reads it off traffic the app already
  makes (no polling, no endpoint) and reloads onto the new build at a safe seam. The
  "newer build seen" mark is **version-scoped** in `sessionStorage` — a bare flag
  persists across the reload and poisons every later error in the tab — and the error
  boundary offers a hard reload, never a `reset()` that just re-renders the stale build.

- **True history-back** (`nav/` + `components/ui/back-button.tsx`) — a `<Link>`-based
  "Back" is a *forward* navigation: it re-renders the target from the server and lands
  at scroll-top. `BackButton` calls `router.back()`, so the previous page is restored
  from the client Router Cache with its tree **and** scroll position, falling back to a
  shelf href when there is no in-app page behind us. "In-app" is decided by tracking
  **history position** (an index stamped into `history.state`), not `history.length` —
  a high-water mark that never shrinks on back and would send Back off-site.

## Credits

Food cutout icons in `/public/food` are from [Twemoji](https://github.com/jdecked/twemoji)
(© Twitter, Inc. and contributors), licensed CC-BY 4.0.

