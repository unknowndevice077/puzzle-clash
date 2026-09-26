import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { DIFFICULTY_SPECS } from '@pc/shared';
import { ConnectionBanner, Icon, Toasts } from './components/ui';
import { actions } from './net/actions';
import { api } from './net/api';
import { connect, serverNow } from './net/socket';
import { GameScreen } from './screens/Game';
import { Home } from './screens/Home';
import { JoinRoute, RoomScreen } from './screens/Room';
import { useApp } from './store';

function Searching() {
  const queue = useApp((s) => s.queue);
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(id);
  }, []);
  if (!queue.searching) return null;
  const secs = Math.max(0, Math.floor((now - queue.since) / 1000));
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-line border-t-tomato" aria-hidden />
        <h2 className="heading mt-4 text-2xl">Finding an opponent</h2>
        <p className="mt-1 text-sm text-muted">
          {queue.difficulty ? DIFFICULTY_SPECS[queue.difficulty].label : ''} · waiting {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </p>
        <p className="mt-3 text-sm text-muted">Playing someone nearby? A friend room is quicker.</p>
        <button type="button" className="btn-secondary mt-5 w-full" onClick={() => void actions.leaveQueue()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const setApp = useApp((s) => s.set);
  const inMatch = useApp((s) => !!s.match);

  const boot = () => {
    setStatus('loading');
    api
      .session()
      .then(({ token, profile }) => {
        setApp({ profile });
        connect(token);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  };

  useEffect(boot, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') return <div className="grid h-full place-items-center font-display text-xl text-muted">Tipping out the pieces…</div>;
  if (status === 'error') {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="heading text-2xl">Can't reach the game server</h1>
          <p className="mt-2 text-muted">Check that you're on the same network as the host, then try again.</p>
          <button type="button" className="btn-primary mt-5" onClick={boot}>
            <Icon name="repeat" size={18} /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <div hidden={inMatch} className="h-full">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room/:code" element={<RoomScreen />} />
            <Route path="/join/:code" element={<JoinRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {inMatch && <GameScreen />}
        <Searching />
        <Toasts />
        <ConnectionBanner />
      </BrowserRouter>
    </MotionConfig>
  );
}
