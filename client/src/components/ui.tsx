import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { api } from '../net/api';
import { useApp } from '../store';

type IconName = 'users' | 'bolt' | 'timer' | 'copy' | 'back' | 'eye' | 'trophy' | 'repeat' | 'upload' | 'check' | 'edges' | 'sound' | 'mute';

const PATHS: Record<IconName, ReactNode> = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.8 14.2c2.3.2 4 1.8 4.6 4.8" />
    </>
  ),
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.5 2M9.5 2.8h5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2.5" />
      <path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" />
    </>
  ),
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.8 3.4M17 6h2.5a2.5 2.5 0 0 1-2.8 3.4M12 14v3.5M8.5 20h7" />
    </>
  ),
  repeat: <path d="M4 11a7 7 0 0 1 12-4.9L18.5 8.5M20 13a7 7 0 0 1-12 4.9L5.5 15.5M18.5 4v4.5H14M5.5 20v-4.5H10" />,
  upload: <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  edges: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 4v16M4 9h16" strokeDasharray="2 2.5" />
    </>
  ),
  sound: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />,
  mute: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16.5 9.5l5 5M21.5 9.5l-5 5" />,
};

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2 select-none sm:gap-2.5" aria-label="Puzzle Clash">
      <svg viewBox="0 0 64 64" aria-hidden className={compact ? "h-[30px] w-[30px]" : "h-8 w-8 sm:h-[38px] sm:w-[38px]"}>
        <path d="M8 14h14a7 7 0 1 1 14 0h14v14a7 7 0 1 0 0 14v14H36a7 7 0 1 0-14 0H8V42a7 7 0 1 1 0-14z" fill="#E4572E" stroke="#1F2A44" strokeWidth="3" strokeLinejoin="round" />
        <path d="M36 28h14" stroke="#1F2A44" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
      </svg>
      {!compact && (
        <span className="heading text-[21px] leading-none sm:text-[26px]">
          Puzzle<span className="text-tomato">Clash</span>
        </span>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`animate-rise rounded-xl border-[1.5px] px-4 py-2 text-sm font-semibold shadow-card ${t.kind === 'error' ? 'border-tomato bg-tomato-soft text-tomato-dark' : 'border-ink bg-card'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function ConnectionBanner() {
  const conn = useApp((s) => s.conn);
  if (conn === 'online' || conn === 'connecting') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-ink px-4 py-2 text-center text-sm font-semibold text-white" role="status">
      {conn === 'reconnecting' ? 'Connection lost. Reconnecting… your match is kept for 30 seconds.' : 'You are offline.'}
    </div>
  );
}

const LOCAL = new Set(['localhost', '127.0.0.1']);

/** Invite with a scannable QR code; on localhost it points other devices at this machine's LAN address. */
export function InviteCard({ code }: { code: string }) {
  const [origin, setOrigin] = useState(window.location.origin);
  const [qr, setQr] = useState('');
  const toast = useApp((s) => s.toast);
  const url = `${origin}/join/${code}`;

  useEffect(() => {
    if (!LOCAL.has(window.location.hostname)) return;
    api
      .network()
      .then((urls) => urls[0] && setOrigin(urls[0]))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#1F2A44', light: '#FFFDF8' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ kind: 'info', message: 'Link copied' });
    } catch {
      toast({ kind: 'info', message: url });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
      {qr && <img src={qr} alt={`QR code linking to ${url}`} className="h-36 w-36 rounded-xl border border-line" />}
      <div className="space-y-2">
        <div className="label">Room code</div>
        <div className="heading text-4xl tracking-[0.25em]">{code}</div>
        <p className="max-w-[240px] text-sm text-muted">Scan with the other phone, or open the game and enter the code.</p>
        <button type="button" className="btn-secondary !min-h-[38px] text-sm" onClick={() => void copy()}>
          <Icon name="copy" size={16} /> Copy link
        </button>
      </div>
    </div>
  );
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '--:--';
  const total = Math.max(0, Math.round(ms / 100));
  const m = Math.floor(total / 600);
  const s = Math.floor((total % 600) / 10);
  const t = total % 10;
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}
