import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BEST_OF_OPTIONS, MAX_UPLOAD_BYTES, PICTURE_PACKS, type RoomState } from '@pc/shared';
import { PieceIcon } from '../components/jigsaw';
import { DifficultyPicker, PackPicker } from '../components/pickers';
import { Icon, InviteCard } from '../components/ui';
import { actions } from '../net/actions';
import { api } from '../net/api';
import { useApp } from '../store';

const SEAT_COLORS = ['#E4572E', '#2A9D8F'];

/** One side of the table. An empty seat shows a waiting piece that wobbles. */
function Seat({ player, slot, me, hostId }: { player: RoomState['players'][number] | undefined; slot: number; me: string | undefined; hostId: string }) {
  if (!player) {
    return (
      <li className="flex min-h-[132px] flex-1 flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed border-ink/25 bg-paper/40 p-3 text-center">
        <PieceIcon size={40} fill="rgba(255,250,240,0.7)" className="animate-wobble" />
        <span className="text-sm font-semibold text-muted">Empty seat</span>
        <span className="text-xs text-muted">Waiting for your opponent…</span>
      </li>
    );
  }
  return (
    <li className="flex min-h-[132px] flex-1 flex-col items-center justify-center gap-2 rounded-xl2 border-[1.5px] border-ink bg-paper p-3 text-center shadow-lift">
      <span className="relative grid h-14 w-14 place-items-center">
        <PieceIcon size={56} fill={SEAT_COLORS[slot]} className="absolute inset-0" />
        <span className="relative font-display text-xl font-extrabold text-paper">{player.name.slice(0, 1).toUpperCase()}</span>
      </span>
      <span className="max-w-full truncate font-display font-bold leading-tight">
        {player.name}
        {player.id === me && <span className="font-body font-semibold text-muted"> (you)</span>}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${player.connected ? 'bg-kraft text-ink' : 'bg-tomato-soft text-tomato-dark'}`}>
        {player.connected ? (player.id === hostId ? 'Host' : 'Ready to race') : 'Reconnecting…'}
      </span>
    </li>
  );
}

export function RoomScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const room = useApp((s) => s.room);
  const me = useApp((s) => s.profile?.id);
  const online = useApp((s) => s.conn === 'online');
  const toast = useApp((s) => s.toast);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!online || room?.code === code) return;
    void actions.joinRoom(code).then((r) => {
      if (!r) setError('Could not join that room.');
    });
    // Join once per code/connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, online]);

  if (error) {
    return (
      <main className="grid min-h-full place-items-center p-6">
        <div className="card max-w-sm p-6 text-center">
          <PieceIcon size={48} fill="#D3BD94" className="mx-auto rotate-12" />
          <h1 className="heading mt-3 text-2xl">That room is empty</h1>
          <p className="mt-2 text-muted">{error} Double-check the code with your friend. Rooms close when everyone leaves.</p>
          <button type="button" className="btn-primary mt-5" onClick={() => navigate('/')}>
            Back to the box
          </button>
        </div>
      </main>
    );
  }
  if (!room) return <main className="grid min-h-full place-items-center font-display text-xl text-muted">Finding your seat…</main>;

  const isHost = room.hostId === me;
  const full = room.players.length === 2;

  const update = (patch: Partial<Pick<typeof room, 'difficulty' | 'bestOf' | 'pack'>>) => {
    void actions.updateRoom(patch.difficulty ?? room.difficulty, patch.bestOf ?? room.bestOf, patch.pack ?? room.pack);
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    setUploading(true);
    for (const f of files) {
      if (f.size > MAX_UPLOAD_BYTES) {
        toast({ kind: 'error', message: `${f.name} is over 6 MB` });
        continue;
      }
      try {
        await api.uploadPicture(room.code, f);
      } catch (err) {
        toast({ kind: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
      }
    }
    setUploading(false);
  };

  // With no uploads the server falls back to the built-in packs, so starting is still allowed.
  const startLabel = !full ? 'Waiting for an opponent' : room.pack === 'custom' && room.uploads === 0 ? 'Start (built-in pictures)' : 'Start the race';

  return (
    <main className="mx-auto max-w-3xl px-4 pb-32 pt-3 sm:pb-16">
      <button
        type="button"
        className="btn-ghost -ml-2"
        onClick={async () => {
          await actions.leaveRoom();
          navigate('/');
        }}
      >
        <Icon name="back" /> Leave room
      </button>

      <div className="mt-2">
        <InviteCard code={room.code} />
      </div>

      <section className="mt-6" aria-labelledby="table-title">
        <h2 id="table-title" className="label mb-2">
          At the table
        </h2>
        <ul className="relative flex items-stretch gap-10 sm:gap-14">
          <Seat player={room.players[0]} slot={0} me={me} hostId={room.hostId} />
          <li aria-hidden className="absolute left-1/2 top-1/2 z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[1.5px] border-ink bg-mustard font-display text-xs font-extrabold shadow-lift">
            VS
          </li>
          <Seat player={room.players[1]} slot={1} me={me} hostId={room.hostId} />
        </ul>
      </section>

      <section className="card mt-6 space-y-5 p-4 sm:p-5" aria-labelledby="settings-title">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="settings-title" className="heading text-xl">
            The match
          </h2>
          {!isHost && <span className="text-xs font-semibold text-muted">The host picks these</span>}
        </div>

        <div className="space-y-2">
          <div className="label">How many pieces</div>
          <DifficultyPicker value={room.difficulty} onChange={(d) => update({ difficulty: d })} disabled={!isHost} />
        </div>

        <div className="space-y-2">
          <div className="label">Rounds</div>
          <div className="segmented" role="group" aria-label="Rounds">
            {BEST_OF_OPTIONS.map((n) => (
              <button key={n} type="button" disabled={!isHost} aria-pressed={room.bestOf === n} onClick={() => update({ bestOf: n })}>
                {n === 1 ? 'One round' : `Best of ${n}`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="label">Pictures</div>
          <PackPicker value={room.pack} onChange={(p) => update({ pack: p })} packs={PICTURE_PACKS} disabled={!isHost} />
        </div>

        {room.pack === 'custom' && (
          <div className="rounded-xl border-[1.5px] border-dashed border-ink/30 bg-table/70 p-4">
            <p className="text-sm">
              <span className="font-display text-lg font-extrabold">{room.uploads}</span> picture{room.uploads === 1 ? '' : 's'} in this room. Screenshots of your favourite shows make great
              puzzles. They stay in this room and are deleted when it closes.
            </p>
            {isHost && (
              <>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void onFiles(e)} />
                <button type="button" className="btn-secondary mt-3" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={18} /> {uploading ? 'Uploading…' : 'Add pictures'}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* Thumb-reach start bar on phones; sits inline on larger screens. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-[1.5px] border-ink/15 bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {isHost ? (
          <button
            type="button"
            className="btn-primary mx-auto w-full max-w-3xl !min-h-[52px] text-base"
            disabled={!full}
            onClick={() => void actions.startRoom()}
          >
            {startLabel}
          </button>
        ) : (
          <p className="py-2 text-center text-sm font-semibold text-muted">Waiting for the host to start the race…</p>
        )}
      </div>
    </main>
  );
}

/** /join/:code (from a QR code or link): join, then show the room. */
export function JoinRoute() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/room/${code.toUpperCase()}`, { replace: true });
  }, [code, navigate]);
  return null;
}
