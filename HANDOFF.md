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

- **Core loop:** on touch devices a floating joystick appears wherever your
  thumb lands (drag past its edge and the base follows, so it never runs
  away); on desktop, hold the mouse and you swim toward it. Eat anything
  smaller (grows you), flee anything bigger (instant death). Combos of 5
  trigger FRENZY (double points, +35% speed, red glow).
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
   `index.html`): global leaderboard AND the live "who's online" list work
   across every device, via your Cloudflare Worker (setup below). This is
   what you want for the GitHub Pages link.
2. **Inside a Claude artifact:** `window.storage` (shared:true) — board and
   live list shared by every player of the artifact automatically.
3. **Plain static hosting, no backend:** localStorage — a persistent top-10
   **per device**; the live list can't exist (a static site has no way to
   see other devices), so the start screen shows a small pointer to this
   doc instead.

**Presence mechanics:** every open tab heartbeats `{id, name, score}` every
5s; entries older than 30s are pruned, so the list self-heals when someone
closes the tab. Score −1 means "in the lobby". In-game, a pill at the
bottom center shows how many other hunters are online; the start screen
lists them by name with live scores. This is a *presence list* — you see
who's playing and their score, not their fish swimming in your world (that
would be real-time multiplayer; see limitations).

Storage keys: `apex-abyss-leaderboard-v1`, `apex-abyss-live-v1`. Board entry
shape: `{name (≤14 chars, sanitized on render), score, tier, t (timestamp)}`.

## Global board + live list in ~5 minutes (Cloudflare Worker + KV)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages →
   Create → Worker**, any name (e.g. `apex-abyss`), deploy the hello-world,
   then **Edit code** and replace it with:

   ```js
   export default {
     async fetch(req, env) {
       const CORS = {
         'Access-Control-Allow-Origin': '*',
         'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
         'Access-Control-Allow-Headers': 'Content-Type',
       };
       if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
       const json = (o, s = 200) => new Response(JSON.stringify(o),
         { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
       const path = new URL(req.url).pathname;

       if (path === '/board' && req.method === 'GET') {
         return json(JSON.parse(await env.KV.get('board') || '[]'));
       }
       if (path === '/score' && req.method === 'POST') {
         const b = await req.json().catch(() => null);
         if (!b || typeof b.score !== 'number' || b.score < 0 || b.score > 100000)
           return json({ error: 'bad' }, 400);
         const entry = { name: String(b.name || 'Hunter').slice(0, 14),
           score: Math.floor(b.score), tier: String(b.tier || '').slice(0, 12), t: Date.now() };
         const board = JSON.parse(await env.KV.get('board') || '[]');
         board.push(entry);
         board.sort((a, z) => z.score - a.score);
         const top = board.slice(0, 10);
         await env.KV.put('board', JSON.stringify(top));
         return json(top);
       }
       if (path === '/live' && req.method === 'POST') {
         const b = await req.json().catch(() => null);
         if (!b || !b.id) return json({ error: 'bad' }, 400);
         const now = Date.now();
         const live = JSON.parse(await env.KV.get('live') || '{}');
         for (const k in live) if (now - live[k].t > 30000) delete live[k];
         const id = String(b.id).slice(0, 40);
         live[id] = { id, n: String(b.n || 'Hunter').slice(0, 14),
           s: typeof b.s === 'number' ? Math.floor(b.s) : -1,
           tier: String(b.tier || '').slice(0, 12), t: now };
         await env.KV.put('live', JSON.stringify(live));
         return json({ players: Object.values(live) });
       }
       return json({ error: 'not found' }, 404);
     }
   };
   ```

2. Worker → **Settings → Bindings → Add → KV namespace**: variable name
   `KV`, create a namespace (e.g. `apex-abyss-kv`), save, then **Deploy**.

3. Copy the worker URL (`https://apex-abyss.<your-subdomain>.workers.dev`)
   into `BACKEND_URL` at the top of the script in `index.html`, commit,
   push. Done — global board + live player list for everyone on the Pages
   link.

Caveats: KV is eventually consistent — players hitting different Cloudflare
regions can take up to ~60s to appear in each other's live list (same
region is near-instant). Heartbeats also race occasionally (last write
wins), which self-heals within one 5s beat. Totally fine for a friends
board; a spam-proof or real-time version wants Durable Objects and a
shared-secret instead.

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

## Known limitations / ideas not yet built

- Presence shows who's online with live scores — not other players' fish in
  your world. True shared-world multiplayer needs a stateful realtime server
  (Cloudflare Durable Objects + WebSockets would host it; the input/render
  code ports over).
- Kelp is decorative — could become stealth cover (predators lose aggro inside).
- No golden rare prey, no persistent progression/unlocks.
- One sound "voice" — a low ambient drone loop would add a lot.
- iOS has no vibration API; consider a subtle screen-flash substitute.
