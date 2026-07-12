# Frame — Recipe App V1 (core)

*Design skill, stage 1. Locked with Freddi 2026-07-12.*

## Hypothesis

> We believe **Romy** — who today screenshots recipes, runs them through
> ChatGPT, and hand-copies the result into her Notes app — is trying to
> **keep every recipe she loves in one place she can cook from**, so she can
> **stop doing the screenshot-ChatGPT-paste dance and stop losing recipes in a
> wall of notes**. We'll know we're right when **she pastes a link and the
> recipe is just there — saved, formatted, searchable — and she stops
> screenshotting.**

## The real user

**Romy.** Not a persona — a real person with a real workflow.

- **Current tool:** Apple Notes, filled by hand.
- **Current process:** screenshot a recipe (usually an Instagram Reel) →
  paste the screenshot into ChatGPT to pull the text out → copy ChatGPT's
  output into a new note. Per recipe. By hand.
- **Primary source:** [@emthenutritionist](https://www.instagram.com/emthenutritionist) —
  a nutritionist who writes the **full recipe into the caption**. Evidence-checked
  (see `docs/spikes/import-poc-findings.md`): 3/3 of Romy's real Reels had the
  complete recipe in the caption, so the caption-path is her main road, not the
  exception. The deferred video-transcription case is a rare safety net for her.

## What the Frame tells us

- The competitor is **not Recime** — it is **screenshot → ChatGPT → Notes**.
  If the app is less effort than that dance, Romy switches. If it is more, she
  does not.
- The core loop is **capture → keep → cook**. Import is not a side feature; it
  is the front door — it is the exact thing she does by hand today.
- Two halves to her pain: the **loud** half is capture (the manual dance); the
  **quiet** half is retrieval (recipes lost in a wall of undifferentiated notes).

## Success signal

Behaviour, not opinion: **she stops screenshotting, and she abandons Notes.**
Cannot be faked.

## Real design input already banked

- Times are often **absent** from captions (of Romy's 3 real recipes: none
  stated a prep time, one stated cook time). The AI correctly returns null
  rather than inventing. **The import-review surface must handle missing fields
  gracefully** and make adding a time frictionless — no awkward empty boxes.
- Three real extracted recipes are on hand for prototype content (no lorem
  ipsum): *Creamy Greek Protein Power Bowls*, *Roasted Strawberry Cheesecake
  Chia Puddings*, *Ultimate Greek Chicken Burgers* — all @emthenutritionist.
