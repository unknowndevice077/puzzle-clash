/** Every Socket.IO event with its payload types. Client payloads are validated server-side with ./schemas. */
import type { DifficultyInput, PlaceInput, RoomConfigInput, RoomJoinInput, SoloInput } from './schemas';
import type { Ack, MatchResult, MatchSnapshot, Notice, PhaseInfo, PlayerProfile, QueueState, RoomState, RoundResult, RoundSetup } from './types';

type Cb<T = undefined> = (res: Ack<T>) => void;

export interface ClientToServerEvents {
  'time:ping': (clientTime: number, cb: (serverTime: number) => void) => void;

  'room:create': (payload: RoomConfigInput, cb: Cb<RoomState>) => void;
  'room:join': (payload: RoomJoinInput, cb: Cb<RoomState>) => void;
  'room:update': (payload: RoomConfigInput, cb: Cb<RoomState>) => void;
  'room:start': (cb: Cb) => void;
  'room:leave': (cb: Cb) => void;

  'queue:join': (payload: DifficultyInput, cb: Cb<QueueState>) => void;
  'queue:leave': (cb: Cb) => void;
  'solo:start': (payload: SoloInput, cb: Cb) => void;

  'piece:place': (payload: PlaceInput) => void;
  'match:rematch': (cb: Cb) => void;
  'match:leave': (cb: Cb) => void;
  'match:resync': (cb: Cb<MatchSnapshot>) => void;
}

export interface ServerToClientEvents {
  'session:profile': (profile: PlayerProfile) => void;
  notice: (notice: Notice) => void;
  'room:state': (room: RoomState | null) => void;
  'queue:state': (state: QueueState) => void;

  'match:snapshot': (snap: MatchSnapshot) => void;
  'match:phase': (phase: PhaseInfo) => void;
  'round:setup': (setup: RoundSetup) => void;
  /** Another player's progress (never their piece positions). */
  progress: (payload: { playerId: string; placed: number; finishMs: number | null }) => void;
  /** Server verdict on one of this client's placements. */
  'piece:ack': (payload: { round: number; index: number; ok: boolean }) => void;
  'round:result': (result: RoundResult) => void;
  'match:result': (result: MatchResult) => void;
  'match:rematch': (payload: { votes: string[] }) => void;
  'match:closed': (payload: { matchId: string }) => void;
  'player:status': (payload: { playerId: string; connected: boolean }) => void;
}

export interface SocketData {
  playerId: string;
  name: string;
}
