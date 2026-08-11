// APEX ABYSS backend — Cloudflare Worker.
// KV holds the global leaderboard; a Durable Object hosts the shared-world
// room (real-time positions + names over WebSockets). Deploy: see HANDOFF.md.
//
// Endpoints:
//   GET  /board   -> top-10 leaderboard JSON
//   POST /score   -> {name, score, tier} insert, returns the new top-10
//   GET  /ws      -> WebSocket into the shared world (positions at ~10Hz)
//   POST /live    -> HTTP heartbeat fallback for clients without WebSockets

export class Game {
  constructor(state) {
    this.state = state;
    this.players = new Map(); // rebuilt from message flow after hibernation
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket')
      return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, msg) {
    let d; try { d = JSON.parse(msg); } catch { return; }
    const id = String(d.id || '').slice(0, 40);
    if (!id) return;
    try { ws.serializeAttachment({ id }); } catch {}
    const p = {
      id,
      n: String(d.n || 'Hunter').slice(0, 14),
      x: d.x | 0,
      y: d.y | 0,
      r: Math.max(6, Math.min(90, (d.r | 0) || 13)),
      s: typeof d.s === 'number' ? d.s | 0 : -1,
      run: !!d.run,
      t: Date.now(),
    };
    this.players.set(id, p);
    const out = JSON.stringify({ type: 'p', p });
    for (const s of this.state.getWebSockets())
      if (s !== ws) { try { s.send(out); } catch {} }
    if (d.hello) {
      try { ws.send(JSON.stringify({ type: 'roster', players: [...this.players.values()] })); } catch {}
    }
  }

  webSocketClose(ws) { this.drop(ws); }
  webSocketError(ws) { this.drop(ws); }

  drop(ws) {
    let id = null;
    try { const a = ws.deserializeAttachment(); id = a && a.id; } catch {}
    if (!id) return;
    // same player reconnected on another socket? then keep their entry
    for (const s of this.state.getWebSockets()) {
      if (s === ws) continue;
      try { const a = s.deserializeAttachment(); if (a && a.id === id) return; } catch {}
    }
    this.players.delete(id);
    const out = JSON.stringify({ type: 'gone', id });
    for (const s of this.state.getWebSockets()) { try { s.send(out); } catch {} }
  }
}

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

    // one global room for everyone
    if (path === '/ws')
      return env.GAME.get(env.GAME.idFromName('abyss')).fetch(req);

    if (path === '/board' && req.method === 'GET')
      return json(JSON.parse(await env.KV.get('board') || '[]'));

    if (path === '/score' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || typeof b.score !== 'number' || b.score < 0 || b.score > 100000)
        return json({ error: 'bad' }, 400);
      const entry = {
        name: String(b.name || 'Hunter').slice(0, 14),
        score: Math.floor(b.score),
        tier: String(b.tier || '').slice(0, 12),
        t: Date.now(),
      };
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
      live[id] = {
        id,
        n: String(b.n || 'Hunter').slice(0, 14),
        s: typeof b.s === 'number' ? Math.floor(b.s) : -1,
        tier: String(b.tier || '').slice(0, 12),
        t: now,
      };
      await env.KV.put('live', JSON.stringify(live));
      return json({ players: Object.values(live) });
    }

    return json({ error: 'not found' }, 404);
  }
};
