# Validate — Romy's Kitchen V1 core

*Design skill, stage 5. Signed off by Freddi 2026-07-12.*

## Does it serve the Frame?

Yes. The Frame: *beat screenshot → ChatGPT → Notes; she pastes a link and the
recipe is just there, and she stops screenshotting.* The prototype walks that
job end to end — ➕ → paste → live extraction → editable review with the Reel
snapshot → saved to a shelf that looks like her own cookbook. Capture is one
ever-present tap; the collection is the home. It reads as less effort than the
manual dance, which is the whole test.

## Quality multipliers

- **Empty states designed:** yes — the empty shelf carries an icon (🧺), microcopy
  that names what would live there and why ("Tap ➕ to add your first recipe…
  no more screenshots into ChatGPT"), and a first action.
- **Signature interaction:** the **import morph** — paste → skeleton → "reading the
  caption" → "extracting with AI" → the review fills itself in, snapshot and all.
  The anti-screenshot moment made literal; it *is* the product's reason to exist.
- **Real content:** yes — Romy, @emthenutritionist, three real recipes (Greek
  Chicken Burgers, Strawberry Cheesecake Chia Puddings, Creamy Greek Protein
  Power Bowls) with real ingredients, steps, and their actual Reel photos.

## What's slick

Deep-basil-on-warm-paper identity lets the food photography carry the colour;
tabular quantities; skeleton loads not spinners; bottom sheet for Add; the
satisfying grocery check-off; both themes tokenised.

## Known edges to design at build time (not blockers)

- **Teaser-Reel fallback state.** The review assumes the caption carried the
  recipe (true for 3/3 of Romy's real Reels). When it doesn't, the graceful
  "recipe's in the video — here's the link, add it yourself" state still needs
  designing. Owned by the import story, not the shell.
- **Real cover for *website* imports.** Reels give a thumbnail free; website
  imports need the og:image or a chosen fallback. Owned by the import story.
- **Search results / populated-vs-no-match** states beyond the home shelf.

## Verdict

Design validated. Direction locked, prototype real, content Romy's own. Ready
to break into build milestones.
