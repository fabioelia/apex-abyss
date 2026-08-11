# APEX ABYSS — Handoff

## What this is

A mobile-first, single-file HTML5 arcade game (eat-and-grow, deep-sea theme).
No build step, no dependencies, no server required. Everything — markup, CSS,
game logic, rendering, audio — lives in `index.html` (~35 KB).

## Contents

| File | Purpose |
|---|---|
| `index.html` | The entire game. This is what GitHub Pages serves. |
| `README.md` | Repo front page with play link and feature summary. |
| `HANDOFF.md` | This document. |

## Deploy to GitHub Pages (one-time, ~2 minutes)

1. Unzip, then from inside the folder:

   ```bash
   git clone https://github.com/fabioelia/apex-abyss tmp-clone
   cp index.html README.md HANDOFF.md tmp-clone/
   cd tmp-clone
   git add -A
   git commit -m "APEX ABYSS"
   git push
   ```

   (If the repo is empty, plain `git push` works. If it has commits you don't
   want, add `--force`.)

2. On GitHub: **repo → Settings → Pages → Source: "Deploy from a branch" →
   Branch: `main`, folder `/ (root)` → Save.**

3. Live in ~1 minute at: **https://fabioelia.github.io/apex-abyss/**
   Share that link — it works on any phone browser, no install.

Any later change is just: edit `index.html`, commit, push. Pages redeploys
automatically.

## Game design summary

- **Core loop:** touch/hold to swim toward your finger. Eat anything smaller
  (grows you), flee anything bigger (instant death). Combos of 5 trigger
  FRENZY (double points, +35% speed, red glow).
- **Progression:** 7 tiers by score — Hatchling(0) → Lurker(8) → Stalker(20)
  → Predator(40) → Alpha(70) → Leviathan(110) → APEX(160). Tier-ups announce
  with screen shake + haptics.
- **World:** 4200×4200, camera-follow with smoothing, red glowing border,
  minimap (bottom-right: predators = red dots, schools = gold blips, viewport
  rectangle, player dot).

## Entities

| Entity | Behavior | Interaction |
|---|---|---|
| Solo fish | Wander; threats (red/orange, teeth) chase within 300px; prey flees | Eat if smaller, die if bigger |
| Schools | 12–22 tiny fish, boids flocking (cohesion/alignment/separation), panic-scatter near player | Always edible once you outsize members; fast combo fuel |
| Jellyfish | Pulse, drift upward, glow violet | Sting: knockback + 1.5s slow + combo reset. Edible when player.r > 2.2× jelly.r |
| Whale | Ambient background silhouette, crosses screen occasionally | None (atmosphere) |
| Kelp, vents, wrecks, plankton | Decoration/landmarks; vents emit bubbles | None |

## Technical notes

- **Rendering:** Canvas 2D, DPR-capped at 2. All world objects are
  frustum-culled (`vis()` helper) so only on-screen entities draw.
- **Spawning:** fish density is maintained in a ring just outside the camera
  (world feels alive without simulating everything); global caps: ~60 solo
  fish, 9 schools, 16 jellies.
- **Simulation scaling:** all movement uses a dt multiplier normalized to
  60fps (`dt = elapsed / 16.67`), so speed is frame-rate independent.
- **Boids:** separation is sampled (2 random neighbors per fish per frame)
  instead of O(n²) — cheap and looks right.
- **Audio:** Web Audio oscillator beeps, created on first user gesture
  (autoplay policy). No audio assets.
- **Haptics:** `navigator.vibrate` on eat/frenzy/tier-up/sting/death
  (no-ops on iOS Safari, which doesn't support it — harmless).
- **Mobile:** `100dvh`, `viewport-fit=cover` + safe-area insets,
  `touch-action:none`, `position:fixed` body to kill scroll/bounce/zoom.

## Leaderboard — read this

The code detects its environment:

1. **Inside a Claude artifact:** uses `window.storage` (shared:true) — one
   global top-10 board shared by every player of the artifact.
2. **On GitHub Pages / any normal website:** `window.storage` doesn't exist,
   so it falls back to **localStorage** — a persistent top-10 **per device**.
   The UI note updates automatically ("Top 10 hunters on this device").
3. **No storage at all:** in-memory, session only.

So the public link has per-device boards, not a global one. A static site has
no server to hold shared state. If you want a real global board:

- **Lightest:** Cloudflare Worker + KV (free tier). ~30 lines: `GET /board`
  returns JSON top-10, `POST /score` validates + inserts. Point `loadBoard` /
  `saveScore` at it. Add a shared-secret or basic rate limit to deter spam.
- Alternatives: Supabase (Postgres + row-level security), Firebase RTDB,
  or Val.town for a zero-infra endpoint.

Storage key: `apex-abyss-leaderboard-v1`. Entry shape:
`{name (≤14 chars, sanitized on render), score, tier, t (timestamp)}`.

## Tuning knobs (all in index.html)

| What | Where | Current |
|---|---|---|
| World size | `const WORLD` | 4200 |
| Tier thresholds | `TIERS` array | 0/8/20/40/70/110/160 |
| Threat spawn rate | `spawnFish`: `Math.random()<0.34` | 34% |
| Frenzy trigger / duration | `combo===5`, `frenzy=300` | 5 kills / ~5s |
| Sting penalty | `stun=90`, speed ×0.45 | ~1.5s slow |
| Max player size | `Math.min(78, ...)` | 78px radius |
| Player base speed | `3.6+...` in loop | scales with score, shrinks with size |

## Known limitations / ideas not yet built

- No real-time multiplayer (needs websocket server; client would port over).
- Kelp is decorative — could become stealth cover (predators lose aggro inside).
- No golden rare prey, no persistent progression/unlocks.
- One sound "voice" — a low ambient drone loop would add a lot.
- iOS has no vibration API; consider a subtle screen-flash substitute.
