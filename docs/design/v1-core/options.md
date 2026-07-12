# Explore — three takes on the shape of the app

*Design skill, stage 2. Rough on purpose — mental models, not pixels. Three
different postures on the same Frame, so we have options to kill before we
commit. Real content throughout (Romy's actual @emthenutritionist recipes).*

The bottom nav is shared across all three (consistent IA per the brief):
`Home · Recipes · ➕ · List · Profile`. What differs is **what "Home" is** —
because that choice declares what the app is *for*.

---

## Concept A — "Cookbook" (collection-first)

**Mental model:** a beautiful personal cookbook. The home *is* the library —
a photo-rich grid of everything Romy has saved. The emotional payoff is owning
a lovely shelf. Import is a prominent action, but the centre of gravity is
*browsing what you've collected*.

```
┌───────────────────────────┐
│  Romy's Kitchen        🔍  │
│  [All] Dinners  Breakfast  │  ← quick-filter chips
│  ┌─────────┐ ┌─────────┐   │
│  │  photo  │ │  photo  │   │
│  │ Greek   │ │ Chia    │   │  ← big cover photos, 2-up
│  │ Burgers │ │ Puddings│   │
│  └─────────┘ └─────────┘   │
│  ┌─────────┐ ┌─────────┐   │
│  │  photo  │ │  photo  │   │
│  │ Power   │ │  …      │   │
│  │ Bowls   │ │         │   │
│  └─────────┘ └─────────┘   │
│  Home · Recipes · ➕ · List · 👤 │
└───────────────────────────┘
```

- **Import:** the ➕ opens a sheet — Instagram / Web / Type it.
- **Signature moment:** saving a recipe animates a new cover **sliding onto the
  shelf** — "it's mine now."
- **Serves:** the *quiet* half of the pain — findability, and the pride of a
  collection that Notes could never give her.
- **Risks:** the *loud* half — capture — is one tap down. On day one, with an
  empty shelf, the home has nothing to show.

---

## Concept B — "Paste Bar" (capture-first)

**Mental model:** a machine that turns links into recipes. A big paste field
dominates the top and declares the app's whole purpose the moment it opens —
like Google's homepage, one job front and centre. The library lives one tab
away.

```
┌───────────────────────────┐
│        Romy's Kitchen      │
│  ┌───────────────────────┐ │
│  │ 🔗 Paste a recipe link│ │  ← hero paste bar
│  └───────────────────────┘ │
│     Instagram · Web · Type │  ← 3 sources inline
│                            │
│  Recently saved            │
│  ▸ Greek Chicken Burgers   │
│  ▸ Chia Puddings           │  ← compact list, not grid
│  ▸ Protein Power Bowls     │
│                            │
│  Home · Recipes · ➕ · List · 👤 │
└───────────────────────────┘
```

- **Import:** *is* the home. Paste and go — no sheet, no detour.
- **Signature moment:** paste → the bar **morphs in place** into a live
  extraction (skeleton → the recipe fills itself in) right where she pasted.
  The magic happens inline, not on a separate screen. This is the anti-
  screenshot moment made literal.
- **Serves:** the *loud* half — capture. Kills the screenshot dance on the
  very first screen. Matches the Frame's strongest verb: *paste*.
- **Risks:** once Romy has 60 recipes, is a paste bar still the right home? It
  optimises the first week over the long haul; browsing feels secondary.

---

## Concept C — "This Week" (cook-first / occasion-led)

**Mental model:** a kitchen companion. Home asks *what are you cooking?* —
surfacing a recipe to cook now, a jump-back-in row, favourites, with grocery
bound in tight. Organised around the act of cooking, not collecting.

```
┌───────────────────────────┐
│  Evening, Romy             │
│  What are we cooking?      │
│  ┌───────────────────────┐ │
│  │ photo  Greek Chicken  │ │  ← one hero suggestion
│  │        Burgers · 2     │ │
│  │        [ Cook ] [+List]│ │
│  └───────────────────────┘ │
│  Jump back in              │
│  ▸ Chia Puddings           │
│  Favourites ♥              │
│  ▸ Protein Power Bowls     │
│  ─ 🔗 Paste a link ──── + ─│  ← capture as a persistent strip
│  Home · Recipes · ➕ · List · 👤 │
└───────────────────────────┘
```

- **Import:** a persistent strip, always reachable but not the star.
- **Signature moment:** a full-screen **cook mode** — big step-by-step, screen
  stays awake, ingredients one swipe away, "add to list" built in.
- **Serves:** the *outcome* end — actually cooking from saved recipes, tight
  capture→cook→shop loop.
- **Risks:** goes **beyond** the V1 Frame. Romy's stated pain is capture +
  findability, not "what should I cook." Flirts with meal-planning, which is
  explicitly out of scope. Likely a V2 posture wearing a V1 coat.

---

## Tara's read (not a decision — Decide is the next stage)

- **B** matches the Frame's loudest verb and its success signal most directly:
  *paste → it's just there → stop screenshotting.*
- **A** owns the quiet half Notes fails at — and is where B's recipes have to
  live anyway once there are more than a handful.
- **C** is the most ambitious and the least V1 — it answers a question Romy
  isn't asking yet.

The live question for Decide is whether the winner is **B**, or a **B-front /
A-home fusion**: open on the capture magic, but let the library be the place
that magic fills. C's cook-mode is a strong idea to bank for later, not to
lead V1 with.
