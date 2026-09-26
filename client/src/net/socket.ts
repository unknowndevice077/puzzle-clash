import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, MatchSnapshot, ServerToClientEvents } from '@pc/shared';
import { sound } from '../lib/sound';
import { useApp, type MatchView } from '../store';
import { api } from './api';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: Client | null = null;
let offset = 0;
let bestRtt = Infinity;

/** Server time, corrected with the ping-measured clock offset. */
export const serverNow = (): number => Date.now() + offset;

export function getSocket(): Client | null {
  return socket;
}

export function call<T>(send: (s: Client, cb: (r: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, error: 'Not connected' });
    const t = setTimeout(() => resolve({ ok: false, error: 'The server did not answer' }), 8000);
    send(socket, (r) => {
      clearTimeout(t);
      resolve(r);
    });
  });
}

function syncClock(): void {
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      const sent = Date.now();
      socket?.emit('time:ping', sent, (server) => {
        const now = Date.now();
        const rtt = now - sent;
        if (rtt <= bestRtt * 1.5) {
          bestRtt = Math.min(bestRtt, rtt);
          offset = server + rtt / 2 - now;
        }
      });
    }, i * 200);
  }
}

function viewFrom(s: MatchSnapshot, previous: MatchView | null): MatchView {
  const same = previous?.matchId === s.matchId;
  return {
    matchId: s.matchId,
    mode: s.mode,
    difficulty: s.difficulty,
    bestOf: s.bestOf,
    pack: s.pack,
    players: s.players,
    phase: s.phase,
    endsAt: s.endsAt,
    roundStartedAt: s.roundStartedAt,
    round: s.round,
    setup: s.setup ?? (same ? previous.setup : null),
    picture: same ? previous.picture : null,
    restorePlaced: s.myPlaced,
    lastRound: s.lastRound,
    result: s.result,
    rematchVotes: s.rematchVotes,
  };
}

async function loadPicture(url: string, round: number): Promise<void> {
  try {
    const obj = await api.picture(url);
    const m = useApp.getState().match;
    if (m?.setup?.round === round) useApp.getState().patchMatch({ picture: obj });
    else URL.revokeObjectURL(obj);
  } catch {
    useApp.getState().toast({ kind: 'error', message: 'Could not load the picture. Check your connection.' });
  }
}

export function connect(token: string): void {
  if (socket) return;
  const app = useApp.getState();
  const s: Client = io({ auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
  socket = s;

  s.on('connect', () => {
    useApp.getState().set({ conn: 'online' });
    bestRtt = Infinity;
    syncClock();
  });
  s.on('disconnect', (reason) => useApp.getState().set({ conn: reason === 'io client disconnect' ? 'offline' : 'reconnecting' }));
  s.on('connect_error', () => useApp.getState().set({ conn: 'reconnecting' }));

  s.on('session:profile', (profile) => useApp.getState().set({ profile }));
  s.on('notice', (n) => useApp.getState().toast(n));
  s.on('room:state', (room) => useApp.getState().set({ room }));
  s.on('queue:state', (queue) => useApp.getState().set({ queue }));

  s.on('match:snapshot', (snap) => {
    const st = useApp.getState();
    const view = viewFrom(snap, st.match);
    st.setMatch(view);
    if (snap.setup && !view.picture) void loadPicture(snap.setup.photoUrl, snap.setup.round);
  });
  s.on('round:setup', (setup) => {
    const st = useApp.getState();
    if (!st.match) return;
    st.patchMatch({ setup, picture: null, restorePlaced: [], players: st.match.players.map((p) => ({ ...p, placed: 0, finishMs: null })) });
    void loadPicture(setup.photoUrl, setup.round);
  });
  s.on('match:phase', (p) => {
    const before = useApp.getState().match?.phase;
    useApp.getState().applyPhase(p);
    if (p.phase === 'SOLVING' && before !== 'SOLVING') sound.go();
  });
  s.on('progress', ({ playerId, placed, finishMs }) => {
    const m = useApp.getState().match;
    if (m) useApp.getState().patchMatch({ players: m.players.map((p) => (p.id === playerId ? { ...p, placed, finishMs } : p)) });
  });
  s.on('round:result', (r) => {
    const st = useApp.getState();
    const m = st.match;
    if (!m) return;
    st.patchMatch({ lastRound: r, players: m.players.map((p) => ({ ...p, score: p.score + (r.winnerId === p.id && m.mode !== 'solo' ? 1 : 0) })) });
    const me = st.profile?.id;
    if (m.mode === 'solo' || r.winnerId === me) sound.win();
    else if (r.winnerId) sound.lose();
  });
  s.on('match:result', (result) => {
    const m = useApp.getState().match;
    if (m) useApp.getState().patchMatch({ result, players: m.players.map((p) => ({ ...p, score: result.scores[p.id] ?? p.score })) });
  });
  s.on('match:rematch', ({ votes }) => useApp.getState().patchMatch({ rematchVotes: votes }));
  s.on('match:closed', ({ matchId }) => {
    const m = useApp.getState().match;
    if (m?.matchId === matchId && m.phase !== 'MATCH_END') useApp.getState().setMatch(null);
  });
  s.on('player:status', ({ playerId, connected }) => {
    const m = useApp.getState().match;
    if (m) useApp.getState().patchMatch({ players: m.players.map((p) => (p.id === playerId ? { ...p, connected } : p)) });
  });

  app.set({ conn: 'connecting' });
}
