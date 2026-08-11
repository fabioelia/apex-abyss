# APEX ABYSS — Handoff

## What this is

A mobile-first, single-file HTML5 arcade game (eat-and-grow, deep-sea theme).
No build step, no dependencies, no server required. Everything — markup, CSS,
game logic, rendering, audio — lives in `index.html` (~35 KB).

## Contents

| File | Purpose |
|---|---|
| `index.html` | The entire game. This is what GitHub Pages serves. |
| `worker/worker.js` | Optional Cloudflare Worker backend: global leaderboard + real-time shared world. |
| `worker/wrangler.toml` | Deploy config for the worker (`npx wrangler deploy`). |
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

- **Core loop:** on touch devices a floating joystick appears wherever your
  thumb lands (drag past its edge and the base follows, so it never runs
  away); on desktop, WASD/arrow keys or hold the mouse. Eat anything
  smaller (grows you), flee anything bigger (instant death). Combos of 5
  trigger FRENZY (double points, +35% speed, red glow).
- **Living food web:** solo fish hunt solo fish — they chase anything under
  0.8× their size within 260px, eat it on contact, and grow (+16% of the
  victim's radius, capped at 110). Smaller fish flee bigger rivals. A fish
  that outgrows the player (>1.05×) flips to threat: red/orange, teeth, and
  starts hunting *you*. Fish speed is capped at 4.2 so hunters can't
  snowball into homing missiles.
- **Music:** fully procedural (no audio files): detuned A1 sub drone, slow
  Am9–F–Cmaj7–Gadd9 pad (~21s loop), sparse pentatonic sonar bells through
  a feedback echo, plus a heartbeat pulse + brighter lowpass during FRENZY.
  Ducks in menus/pause. Toggle: ♪ button in-game or MUSIC in the pause
  menu; preference persists in localStorage (`apex-abyss-music`).
- **Pause menu:** the ❚❚ button (top center), Esc/P, the browser back
  button/gesture, or backgrounding the tab all pause. Menu offers Resume /
  Restart run / Main menu. Back navigation is trapped (`history.pushState`
  re-armed on every `popstate`) so it can never kill a run.
- **Progression:** 7 tiers by score — Hatchling(0) → Lurker(8) → Stalker(20)
  → Predator(40) → Alpha(70) → Leviathan(110) → APEX(160). Tier-ups announce
  with screen shake + haptics.
- **World:** 4200×4200, camera-follow with smoothing, red glowing border,
  minimap (bottom-right: predators = red dots, schools = gold blips, viewport
  rectangle, player dot).

## Entities

| Entity | Behavior | Interaction |
|---|---|---|
| Solo fish | Wander; hunt + eat smaller fish and grow (staggered scan, every 4th frame); flee bigger rivals; threats (red/orange, teeth) chase the player within 300px; outgrowing the player converts a fish into a threat | Eat if smaller, die if bigger |
| Schools | 12–22 tiny fish, boids flocking (cohesion/alignment/separation), panic-scatter near player | Always edible once you outsize members; fast combo fuel |
| Jellyfish | Pulse, drift upward, glow violet | Sting: knockback + 1.5s slow + combo reset. Edible when player.r > 2.2× jelly.r |
| Whale | Ambient background silhouette, crosses screen occasionally | None (atmosphere) |
| Kelp, vents, wrecks, plankton | Decoration/landmarks; vents emit bubbles | None |

## Technical notes

- **Rendering:** Canvas 2D, DPR-capped at 2. All world objects are
  frustum-culled (`vis()` helper) so only on-screen entities draw.
- **Auto-quality governor:** the loop tracks an exponential moving average
  of frame time; sustained >26ms drops `quality` a step (render resolution
  scales down, floor 0.5×), sustained <15ms climbs back up. Cooldowns (240 /
  720 frames) prevent oscillation. Weak phones silently render fewer pixels
  instead of stuttering.
- **Simulation bubble:** every fish/school/jelly gets one squared-distance
  check per frame. Inside ~0.95× screen diagonal it counts toward on-screen
  density; outside ~1.05× it is *frozen* — zero simulation, zero draw cost
  (minimap still shows it). Fish beyond 1.7× while over the 70-entity
  budget are recycled; schools beyond 2× respawn near the player. **The
  density spawner is hard-capped at 90 fish — it used to run unbounded
  (one spawn per frame while fewer than 12 fish were "near"), which grew
  the fish array forever and was the "game lags over time" bug.**
- **Allocation hygiene:** background and kelp gradients are built once and
  cached (they were re-created every frame per strand — constant GC churn);
  the per-frame "near fish" census is a counting loop, not a `filter()`.
- **shadowBlur only on the player:** canvas shadows are the single most
  expensive 2D effect on mobile GPUs. Jellies rely on their radial-gradient
  glow, remote hunters get a cheap alpha halo disc, and the player keeps
  one modest shadow (blur 14–30).
- **Minimap at 10Hz:** redrawn every 6th frame — imperceptible on a 92px
  map, saves a full clear+iterate pass per frame. Vent bubbles only spawn
  from vents near the view.
- **Spawning:** fish density is maintained in a ring just outside the camera
  (world feels alive without simulating everything); global caps: ~60 solo
  fish, 9 schools, 16 jellies.
- **Spawn safety:** `awayFromPlayer()` guarantees threats and jellyfish
  never spawn (or respawn after being eaten) inside the player's view
  bubble (half the screen diagonal + 120px) — a predator materializing on
  the player was an instant unfair death. If the world border clamps the
  pushed-out point back into view, it rotates around the player until a
  valid spot is found. Harmless prey may still spawn in view so the world
  stays lively.
- **Simulation scaling:** all movement uses a dt multiplier normalized to
  60fps (`dt = elapsed / 16.67`), so speed is frame-rate independent.
- **Boids:** separation is sampled (2 random neighbors per fish per frame)
  instead of O(n²) — cheap and looks right.
- **Audio:** Web Audio oscillator beeps for SFX, created on first user
  gesture (autoplay policy). No audio assets anywhere.
- **Music engine:** built on the same AudioContext at first DIVE IN. Graph:
  notes → master gain → lowpass(900Hz) → destination, with a 0.42s delay +
  0.34 feedback loop for the bells. A 400ms `setInterval` scheduler keeps a
  1.3s lookahead window filled (bar length 5.2s), so timing survives tab
  throttling; `frenzy` is read at schedule time to swell volume, open the
  filter to 2.2kHz, and add the heartbeat.
- **Food web cost:** each active fish scans for prey/rivals every 4th frame
  (`(i+frameCount)&3`) — the O(n²) pair scan becomes n²/4 cheap box-checks
  spread across frames, ~1.2k/frame at the 70-fish cap.
- **Haptics:** `navigator.vibrate` on eat/frenzy/tier-up/sting/death
  (no-ops on iOS Safari, which doesn't support it — harmless).
- **Mobile:** `100dvh`, `viewport-fit=cover` + safe-area insets (all four
  edges), `touch-action:none`, `overscroll-behavior:none`, `position:fixed`
  body to kill scroll/bounce/zoom.
- **Joystick:** DOM element (`#joy`), tracked by touch identifier so a
  second finger can't hijack steering; deadzone 0.14, radius 52px, base
  re-anchors on long swipes. A faint "ghost" ring rests bottom-left as a
  hint while playing.
- **Landscape:** canvas re-measures on `resize` and (with a 250ms settle
  delay for iOS) `orientationchange`; start/death overlays switch to a
  two-column layout below 560px height.
- **Overlay hit-testing (important):** hidden overlays use
  `visibility:hidden` + a `pointer-events:none !important` child rule. The
  original build only set `pointer-events:none` on the container, which its
  `pointer-events:auto` children (buttons, name input) overrode — so the
  invisible DIVE IN / HUNT AGAIN buttons swallowed mid-game taps and
  silently restarted the run (the "teleport to center" bug). Don't regress
  this.

## Leaderboard & live players — read this

Both features share one backend-detection chain, checked in this order:

1. **`BACKEND_URL` set** (the const at the top of the `<script>` in
   `index.html`): global leaderboard, live "who's online" list, AND the
   real-time shared world — everyone on the link plays in the same ocean
   and sees each other's fish with name tags and colored minimap dots.
   Needs the worker deployed (setup below). This is what you want for the
   GitHub Pages link.
2. **Inside a Claude artifact:** `window.storage` (shared:true) — board and
   who's-online list shared by every player of the artifact (no realtime
   world; artifact pages can't open sockets to external hosts).
3. **Plain static hosting, no backend:** localStorage — a persistent top-10
   **per device**; the live list can't exist (a static site has no way to
   see other devices), so the start screen shows a small pointer to this
   doc instead.

**Shared-world mechanics (`BACKEND_URL` mode):** each client opens a
WebSocket to the worker's Durable Object room and sends
`{id, name, x, y, r, score, run}` at 10Hz; the room relays every update to
everyone else and hands new joiners a full roster. Remote hunters render as
glowing ghost fish (color hashed from their id) with their name above and a
matching dot on the minimap, positions smoothed toward the last report and
snapped if they jump >600px (respawn). They're ghosts: no PvP — you can't
eat or be eaten by another player. Each player's prey/threat ecosystem is
simulated locally, so you share the ocean and see each other swim, but the
small fish around you are your own. If the socket can't connect (an old
KV-only worker, or a network that blocks WebSockets), the client falls back
to an HTTP heartbeat every 5s (30s staleness pruning) that still powers the
who's-online list. Score −1 means "in the lobby"; the in-game pill (bottom
center) counts hunters swimming with you.

Storage keys: `apex-abyss-leaderboard-v1`, `apex-abyss-live-v1`. Board entry
shape: `{name (≤14 chars, sanitized on render), score, tier, t (timestamp)}`.

## Deploy the backend in ~5 minutes (Cloudflare, free tier)

The complete backend lives in `worker/worker.js`: KV for the leaderboard, a
Durable Object (`Game`) for the real-time room. Two ways to deploy — the
CLI is the easy one because it wires up the Durable Object migration for
you:

**Option A — wrangler CLI (recommended):**

```bash
cd worker
npx wrangler login                      # opens browser, free account is fine
npx wrangler kv namespace create KV     # prints an id
# paste that id into wrangler.toml where it says REPLACE_WITH_...
npx wrangler deploy                     # prints your worker URL
```

**Option B — dashboard:** [dash.cloudflare.com](https://dash.cloudflare.com)
→ Workers & Pages → Create → Worker → deploy the hello-world → Edit code →
paste all of `worker/worker.js` → Deploy. Then Settings → Bindings: add a
**KV namespace** (variable name `KV`) and a **Durable Object namespace**
(variable name `GAME`, class `Game` — accept the migration prompt if one
appears) → Deploy again.

**Finish:** copy the worker URL
(`https://apex-abyss.<your-subdomain>.workers.dev`) into `BACKEND_URL` at
the top of the script in `index.html`, commit, push. Everyone on the Pages
link is now in the same ocean, with one global board.

Caveats: the room is a plain relay with no auth — fine for friends, but
anyone with the URL can join and could spoof positions/scores; add a
shared-secret query param to `/ws` and `/score` if that ever matters. The
KV `/live` fallback is eventually consistent (cross-region lag up to ~60s);
the WebSocket path has no such lag.

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
| Joystick radius / deadzone | `JOY_R`, `JOY_DEAD` | 52px / 0.14 |
| Presence heartbeat / timeout | `setInterval(heartbeat,5000)`, prune `>30000` | 5s / 30s |
| Spawn safety radius | `awayFromPlayer`: `Math.hypot(W,H)/2+120` | view bubble + 120px |
| Net position send rate | `setInterval(()=>sendState(false),100)` | 10 Hz |
| Remote smoothing / snap | `.2*dt` lerp, snap if `>600px` off | — |
| Fish population caps | `fish.length<90` (density), `<60` (world), `>70` recycle | 60–90 |
| Simulation bubble radii | `R_NEAR2/R_FREEZE2/R_CULL2` in `resize()` | 0.95× / 1.05× / 1.7× diag |
| Quality governor | `frameAvg>26` down, `<15` up, floor `.5` | steps of .17 |
| Food web: sense / prey / flee ratios | `260`px box, `o.r<f.r*.8`, `o.r>f.r*1.25` | — |
| Food web: growth / size cap / speed cap | `+prey.r*.16`, `Math.min(110,...)`, `4.2` | — |
| Threat conversion | `f.r>player.r*1.05` flips `threat` | 1.05× |
| Music: bar / chords / bell density | `BAR=5.2`, `CHORDS`, `.65` per bar (3 in frenzy) | ~21s loop |
| Music: volumes | drone `.15`, pad `.05`, bells `.075`, master `.3`/`.4` frenzy | — |

## Known limitations / ideas not yet built

- No PvP: remote hunters are ghosts — you can't eat each other. Making that
  fair needs the Durable Object to become authoritative over collisions
  (right now it's a dumb relay that trusts clients).
- Ecosystems are per-player: everyone shares the ocean and sees each other,
  but the prey/threat fish around each player are simulated locally. Shared
  fish would mean simulating the world in the Durable Object and streaming
  it down.
- Kelp is decorative — could become stealth cover (predators lose aggro inside).
- No golden rare prey, no persistent progression/unlocks.
- Music is one mood — could shift key/tempo with depth or tier for more arc.
- iOS has no vibration API; consider a subtle screen-flash substitute.
