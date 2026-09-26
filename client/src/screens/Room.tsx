import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BEST_OF_OPTIONS, DIFFICULTIES, DIFFICULTY_SPECS, MAX_UPLOAD_BYTES, PACK_LABELS, PICTURE_PACKS } from '@pc/shared';
import { Icon, InviteCard } from '../components/ui';
import { actions } from '../net/actions';
import { api } from '../net/api';
import { useApp } from '../store';

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
          <h1 className="heading text-2xl">Room not found</h1>
          <p className="mt-2 text-muted">{error} Check the code with your friend.</p>
          <button type="button" className="btn-primary mt-5" onClick={() => navigate('/')}>
            Back to home
          </button>
        </div>
      </main>
    );
  }
  if (!room) return <main className="grid min-h-full place-items-center font-display text-xl text-muted">Joining room…</main>;

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

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-5">
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

      <section className="card mt-3 p-5">
        <InviteCard code={room.code} />
      </section>

      <section className="card mt-5 p-5">
        <h2 className="heading text-xl">Players</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {[0, 1].map((slot) => {
            const p = room.players[slot];
            return (
              <li key={slot} className={`flex min-h-[64px] items-center gap-3 rounded-xl border-[1.5px] px-4 ${p ? 'border-ink bg-card' : 'border-dashed border-line bg-table'}`}>
                {p ? (
                  <>
                    <span className={`grid h-9 w-9 place-items-center rounded-full font-display font-bold text-white ${slot === 0 ? 'bg-tomato' : 'bg-teal'}`}>{p.name.slice(0, 1).toUpperCase()}</span>
                    <span className="flex-1">
                      <span className="block font-semibold">
                        {p.name} {p.id === me && <span className="text-muted">(you)</span>}
                      </span>
                      <span className="text-xs text-muted">{p.id === room.hostId ? 'Host' : 'Guest'}{p.connected ? '' : ' · offline'}</span>
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-3 text-sm text-muted">
                    <span className="h-3 w-3 animate-pulseRing rounded-full bg-tomato" />
                    Waiting for your opponent…
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card mt-5 space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="heading text-xl">Match settings</h2>
          {!isHost && <span className="text-sm text-muted">The host picks these</span>}
        </div>
        <fieldset disabled={!isHost} className="space-y-4">
          <div className="space-y-2">
            <div className="label">Difficulty</div>
            <div className="segmented" role="group" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" aria-pressed={room.difficulty === d} onClick={() => update({ difficulty: d })}>
                  {DIFFICULTY_SPECS[d].label} · {DIFFICULTY_SPECS[d].cols * DIFFICULTY_SPECS[d].rows}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="label">Rounds</div>
            <div className="segmented" role="group" aria-label="Rounds">
              {BEST_OF_OPTIONS.map((n) => (
                <button key={n} type="button" aria-pressed={room.bestOf === n} onClick={() => update({ bestOf: n })}>
                  {n === 1 ? 'Single round' : `Best of ${n}`}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="label">Pictures</div>
            <div className="segmented flex-wrap" role="group" aria-label="Pictures">
              {PICTURE_PACKS.map((p) => (
                <button key={p} type="button" aria-pressed={room.pack === p} onClick={() => update({ pack: p })}>
                  {PACK_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
        {room.pack === 'custom' && (
          <div className="rounded-xl border-[1.5px] border-dashed border-line bg-table p-4">
            <p className="text-sm">
              <span className="font-semibold">{room.uploads}</span> picture{room.uploads === 1 ? '' : 's'} uploaded. Screenshots from your favourite shows work well. Pictures stay in this room only and
              are deleted when it closes.
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
        {isHost ? (
          <button type="button" className="btn-primary w-full" disabled={!full} onClick={() => void actions.startRoom()}>
            {full ? 'Start match' : 'Waiting for opponent'}
          </button>
        ) : (
          <p className="text-center text-sm text-muted">Waiting for the host to start…</p>
        )}
      </section>
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
