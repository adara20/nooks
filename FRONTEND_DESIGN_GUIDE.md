# Nooks: Frontend Design Philosophy & Guidelines

## Core Aesthetic
Nooks is **warm, playful, and personal**. It is a private space for the user — not a corporate productivity tool. Every design decision should reinforce that feeling.

- **Warm color palette**: `nook-orange` as the dominant accent, `nook-sand`, `nook-clay`, `nook-leaf`, `nook-ink` as the core palette.
- **Friendly typography**: Distinctive display font for headings, clean body font. Avoid Inter, Roboto, and other overused system fonts.
- **Rounded, friendly components**: Prefer `rounded-2xl` and `rounded-3xl`. Sharp corners are reserved for emphasis only.
- **Emoji-forward**: Buckets use emojis as icons. Lean into this — it's part of the personality.
- **Playful copy**: UI strings should feel human and slightly cheeky. "Finding your nooks..." not "Loading...". "What needs doing?" not "Task title".

## Key Rules
- **Mobile-first**: Designed for iPhone home screen use. Everything must feel right at 390px wide.
- **Thumb-friendly**: Interactive elements should be large enough to tap comfortably. FABs, bottom nav, and action buttons must meet minimum touch target sizes.
- **High-density functional data**: Show meaningful info on task cards (bucket emoji, due date, urgency/importance tags). Don't waste space.
- **Intentionality over decoration**: Every visual element must have a purpose.

## Motion
- Use `motion/react` (Framer Motion) for meaningful transitions — tab switches, modal entries, task list changes.
- Keep animations fast and subtle (150–250ms). Do not animate for the sake of animating.
- CSS-only animations for micro-interactions (pulse on in-progress indicator, hover states).

## What to AVOID
- Generic "productivity app" aesthetics — no plain blues, flat corporate whites, cookie-cutter card grids.
- Overused font families (Inter, Roboto, etc.).
- Cliché color schemes (purple gradients, teal/green SaaS palettes).
- Cluttered layouts — when in doubt, remove elements rather than add them.
- Long loading states — the app is local-first; if something feels slow, it's a bug.
