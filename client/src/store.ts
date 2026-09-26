import { create } from 'zustand';
import type {
  MatchPhase,
  MatchPlayer,
  MatchResult,
  MatchSnapshot,
  Notice,
  PhaseInfo,
  PlayerProfile,
  QueueState,
  RoomState,
  RoundResult,
  RoundSetup,
} from '@pc/shared';

export type Conn = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface MatchView {
  matchId: string;
  mode: MatchSnapshot['mode'];
  difficulty: MatchSnapshot['difficulty'];
  bestOf: MatchSnapshot['bestOf'];
  pack: MatchSnapshot['pack'];
  players: MatchPlayer[];
  phase: MatchPhase;
  endsAt: number;
  roundStartedAt: number;
  round: number;
  setup: RoundSetup | null;
  /** Object URL of the round's picture once downloaded. */
  picture: string | null;
  /** Pieces placed before a reconnect, to restore the board. */
  restorePlaced: number[];
  lastRound: RoundResult | null;
  result: MatchResult | null;
  rematchVotes: string[];
}

interface Toast extends Notice {
  id: number;
}

interface AppState {
  profile: PlayerProfile | null;
  conn: Conn;
  room: RoomState | null;
  queue: QueueState;
  match: MatchView | null;
  toasts: Toast[];
  set: (patch: Partial<Pick<AppState, 'profile' | 'conn' | 'room' | 'queue'>>) => void;
  setMatch: (m: MatchView | null) => void;
  patchMatch: (patch: Partial<MatchView>) => void;
  applyPhase: (p: PhaseInfo) => void;
  toast: (n: Notice) => void;
}

let toastId = 1;

export const useApp = create<AppState>((set, get) => ({
  profile: null,
  conn: 'connecting',
  room: null,
  queue: { searching: false, difficulty: null, since: 0 },
  match: null,
  toasts: [],
  set: (patch) => set(patch),
  setMatch: (match) => {
    const old = get().match?.picture;
    if (old && old !== match?.picture) URL.revokeObjectURL(old);
    set({ match });
  },
  patchMatch: (patch) => {
    const m = get().match;
    if (!m) return;
    if (patch.picture !== undefined && m.picture && m.picture !== patch.picture) URL.revokeObjectURL(m.picture);
    set({ match: { ...m, ...patch } });
  },
  applyPhase: (p) => get().patchMatch({ phase: p.phase, endsAt: p.endsAt, roundStartedAt: p.roundStartedAt, round: p.round }),
  toast: (n) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...n, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), n.kind === 'error' ? 6000 : 3500);
  },
}));
