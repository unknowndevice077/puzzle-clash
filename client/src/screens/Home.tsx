import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DIFFICULTIES, DIFFICULTY_SPECS, type BestTimeEntry, type Difficulty, type PicturePack } from '@pc/shared';
import { JigsawPicture, PieceIcon } from '../components/jigsaw';
import { DifficultyPicker, PackPicker } from '../components/pickers';
import { Icon, Logo, formatMs } from '../components/ui';
import { isMuted, setMuted } from '../lib/sound';
import { actions } from '../net/actions';
import { api } from '../net/api';
import { useApp } from '../store';

type Mode = 'friend' | 'quick' | 'solo';

const MODES: { id: Mode; label: string; color: string; blurb: string }[] = [
  { id: 'friend', label: 'Play a friend', color: '#E4572E', blurb: 'Private room with a code and a QR. Best on the same Wi-Fi.' },
  { id: 'quick', label: 'Quick match', color: '#F3A712', blurb: 'Get paired with whoever is online. Ghibli stills, best of three.' },
  { id: 'solo', label: 'Solo', color: '#2A9D8F', blurb: 'No opponent, just the clock. Warm up or chase a record.' },
];

function NameChip() {
  const profile = useApp((s) => s.profile);
  const setApp = useApp((s) => s.set);
  const toast = useApp((s) => s.toast);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.session(name.trim());
      setApp({ profile: res.profile });
      setEditing(false);
    } catch (err) {
      toast({ kind: 'error', message: err instanceof Error ? err.message : 'Could not rename' });
    }
  };

  if (!profile) return null;
  if (editing) {
    return (
      <form onSubmit={save} className="flex items-center gap-1.5">
        <label htmlFor="name" className="sr-only">
          Your name
        </label>
        <input id="name" className="input !min-h-[40px] w-36" autoFocus maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn-secondary !min-h-[40px] !px-3" aria-label="Save name">
          <Icon name="check" size={18} />
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className="flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-ink/15 bg-paper/70 py-1 pl-1 pr-3 text-left hover:border-ink/40"
      onClick={() => {
        setName(profile.name);
        setEditing(true);
      }}
      aria-label={`Your name is ${profile.name}. Tap to rename.`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-display text-sm font-bold text-paper">{profile.name.slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0">
        <span className="block max-w-[96px] truncate text-sm font-bold leading-tight sm:max-w-[160px]">{profile.name}</span>
        <span className="block text-[11px] leading-tight text-muted">
          {profile.wins}W · {profile.losses}L
        </span>
      </span>
    </button>
  );
}

/** The home "box lid": a real pack picture cut with the real generator, one piece popping out. */
function BoxLid() {
  return (
    <section className="relative animate-rise" aria-labelledby="lid-title">
      <div className="relative rounded-[22px] border-[1.5px] border-ink bg-paper p-3 shadow-lid sm:p-4">
        <div className="flex items-center justify-between gap-2 px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          <span>2 players · live race</span>
          <span className="hidden min-[380px]:inline">12 · 20 · 35 pieces</span>
        </div>
        <JigsawPicture src="/api/cover/ghibli" cols={5} rows={4} seed={1407} lift={9} className="w-full" alt="A Studio Ghibli still cut into 20 jigsaw pieces, with one piece lifted out" />
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
          <h1 id="lid-title" className="heading text-[34px] leading-[0.95] sm:text-5xl">
            Same picture.
            <br />
            <span className="text-tomato">Faster hands.</span>
          </h1>
          <p className="max-w-[16rem] pb-1 text-sm leading-snug text-muted">
            Both of you get the identical cut. Their progress climbs right next to yours.
          </p>
        </div>
      </div>
      {/* A stray piece that fell out of the box. */}
      <PieceIcon size={46} fill="#F3A712" className="absolute -bottom-4 -right-2 rotate-[18deg] drop-shadow-[2px_3px_0_rgba(31,42,68,0.25)] sm:-right-5" />
    </section>
  );
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Game mode">
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="mode-panel"
            onClick={() => onChange(m.id)}
            className={`relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-t-xl border-[1.5px] border-b-0 px-1 pt-2 font-display text-[13px] font-bold leading-tight transition sm:text-sm ${
              on ? 'z-10 -mb-[1.5px] border-ink bg-paper pb-3' : 'border-ink/15 bg-kraft-dark/50 pb-2 text-ink/70 hover:bg-kraft-dark/80'
            }`}
          >
            <PieceIcon size={20} fill={on ? m.color : 'rgba(255,250,240,0.6)'} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function PlayPanel() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('friend');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [pack, setPack] = useState<PicturePack>('ghibli');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const info = MODES.find((m) => m.id === mode) ?? MODES[0];
  const soloPack = pack === 'custom' ? 'ghibli' : pack;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <section aria-label="Start a game">
      <ModeTabs mode={mode} onChange={setMode} />
      <div id="mode-panel" role="tabpanel" className="card space-y-4 rounded-t-none p-4 sm:p-5">
        <p className="text-sm text-muted">{info.blurb}</p>

        <div className="space-y-2">
          <div className="label">How many pieces</div>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </div>

        {mode !== 'quick' && (
          <div className="space-y-2">
            <div className="label">Pictures</div>
            <PackPicker value={mode === 'solo' ? soloPack : pack} onChange={setPack} packs={mode === 'solo' ? ['ghibli', 'photos'] : ['ghibli', 'photos', 'custom']} />
          </div>
        )}

        {mode === 'friend' && (
          <>
            <button
              type="button"
              className="btn-primary w-full !min-h-[52px] text-base"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const room = await actions.createRoom(difficulty, 3, pack);
                  if (room) navigate(`/room/${room.code}`);
                })
              }
            >
              Create a room
            </button>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim().length === 5) navigate(`/join/${code.trim().toUpperCase()}`);
              }}
            >
              <label htmlFor="code" className="sr-only">
                Room code
              </label>
              <input
                id="code"
                className="input font-display uppercase tracking-[0.3em] placeholder:font-body placeholder:normal-case placeholder:tracking-normal"
                placeholder="Got a code from a friend?"
                maxLength={5}
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button type="submit" className="btn-secondary shrink-0" disabled={code.length !== 5}>
                Join
              </button>
            </form>
          </>
        )}
        {mode === 'quick' && (
          <button type="button" className="btn-primary w-full !min-h-[52px] text-base" disabled={busy} onClick={() => void run(() => actions.joinQueue(difficulty))}>
            <Icon name="bolt" size={18} /> Find an opponent
          </button>
        )}
        {mode === 'solo' && (
          <button type="button" className="btn-primary w-full !min-h-[52px] text-base" disabled={busy} onClick={() => void run(() => actions.solo(difficulty, soloPack))}>
            <Icon name="timer" size={18} /> Start the clock
          </button>
        )}
      </div>
    </section>
  );
}

function BestTimes() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [rows, setRows] = useState<BestTimeEntry[] | null>(null);
  const mine = useApp((s) => s.profile?.bestTimes);
  useEffect(() => {
    setRows(null);
    api
      .best(difficulty)
      .then(setRows)
      .catch(() => setRows([]));
  }, [difficulty]);
  return (
    <section className="card-soft p-4 sm:p-5" aria-labelledby="best-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="best-title" className="heading flex items-center gap-2 text-lg">
          <Icon name="trophy" /> Fastest solves
        </h2>
        <div className="segmented" role="group" aria-label="Leaderboard difficulty">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" aria-pressed={d === difficulty} onClick={() => setDifficulty(d)}>
              {DIFFICULTY_SPECS[d].label}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-3 space-y-1">
        {rows === null && <li className="py-2 text-sm text-muted">Loading…</li>}
        {rows?.length === 0 && <li className="py-2 text-sm text-muted">Nobody has finished one yet. The record is yours to take.</li>}
        {rows?.slice(0, 6).map((r) => (
          <li key={`${r.position}-${r.name}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-kraft/40">
            <span className={`w-5 text-center font-display font-extrabold ${r.position === 1 ? 'text-tomato' : 'text-muted'}`}>{r.position}</span>
            <span className="flex-1 truncate font-semibold">{r.name}</span>
            <span className="font-display tabular-nums">{formatMs(r.ms)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-dashed border-ink/15 pt-2 text-xs text-muted">
        Your best on {DIFFICULTY_SPECS[difficulty].label.toLowerCase()}: <span className="font-display font-bold tabular-nums text-ink">{formatMs(mine?.[difficulty] ?? null)}</span>
      </p>
    </section>
  );
}

const STEPS: [string, string][] = [
  ['Look', 'A three-second countdown shows the finished picture. Memorise the sky.'],
  ['Race', 'Drag pieces onto the board. Close enough and they click in. "Edges" pulls the border pieces to the front.'],
  ['Win', 'Last piece placed takes the round. Out of time? Most pieces wins.'],
];

function HowItWorks() {
  return (
    <section className="card-soft p-4 sm:p-5" aria-labelledby="how-title">
      <h2 id="how-title" className="heading text-lg">
        How a round goes
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center">
              <PieceIcon size={36} fill={['#E4572E', '#F3A712', '#2A9D8F'][i]} className="absolute inset-0" />
              <span className="relative font-display text-sm font-extrabold text-ink">{i + 1}</span>
            </span>
            <div>
              <h3 className="font-display font-bold leading-tight">{t}</h3>
              <p className="text-sm text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Home() {
  const [muted, setMute] = useState(isMuted());

  return (
    <main className="mx-auto max-w-6xl px-4 pb-14 pt-4 sm:px-6 sm:pt-6">
      <header className="flex items-center justify-between gap-2">
        <Logo />
        <div className="flex min-w-0 items-center gap-1">
          <NameChip />
          <button
            type="button"
            className="btn-ghost !min-w-[44px] !px-2"
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            aria-pressed={muted}
            onClick={() => {
              setMuted(!muted);
              setMute(!muted);
            }}
          >
            <Icon name={muted ? 'mute' : 'sound'} />
          </button>
        </div>
      </header>

      <div className="mt-5 grid items-start gap-7 lg:mt-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
        <div className="space-y-7 lg:sticky lg:top-6">
          <BoxLid />
          <div className="hidden lg:block">
            <HowItWorks />
          </div>
        </div>
        <div className="space-y-5">
          <PlayPanel />
          <BestTimes />
          <div className="lg:hidden">
            <HowItWorks />
          </div>
        </div>
      </div>

      <footer className="mt-10 text-center text-xs leading-relaxed text-muted">
        Scene stills © Studio Ghibli, released by the studio for free use. Nature & places photos via Unsplash (Unsplash License).
      </footer>
    </main>
  );
}
