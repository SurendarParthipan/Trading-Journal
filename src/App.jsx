import { Component, useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { ToastProvider, useToast } from './components/ui';
import { Sidebar, MobileHeader, BottomNav, VIEWS } from './components/Nav';
import Ticker from './components/Ticker';
import HudBackground from './components/HudBackground';
import BootScreen from './components/BootScreen';
import AutoBackup from './components/AutoBackup';
import { confetti } from './components/fx';
import { useJournal } from './lib/useJournal';
import Dashboard from './views/Dashboard';
import NewTrade from './views/NewTrade';
import HistoryView from './views/History';
import CalendarView from './views/Calendar';
import Discipline from './views/Discipline';
import Settings from './views/Settings';

/** Keeps one broken view from blanking the whole app; data in IndexedDB is untouched. */
class ViewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <div className="text-base font-semibold text-white">This view hit an error</div>
        <p className="mt-2 text-sm text-zinc-400">Your journal data is safe. Try another tab or reload.</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-3 text-left font-mono text-[11px] text-rose-300">{String(this.state.error?.message || this.state.error)}</pre>
        <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

/** Celebrates level-ups and newly unlocked badges (remembers what was already seen). */
function ProgressWatcher() {
  const { xp } = useJournal();
  const toast = useToast();
  const unlocked = xp.badges.filter((b) => b.unlocked).map((b) => b.id);
  const key = `${xp.level}|${unlocked.join(',')}`;
  useEffect(() => {
    let seen = null;
    try {
      seen = JSON.parse(localStorage.getItem('sj-progress-v1') || 'null');
    } catch { /* ignore */ }
    try {
      localStorage.setItem('sj-progress-v1', JSON.stringify({ level: xp.level, badges: unlocked }));
    } catch { /* ignore */ }
    if (!seen) return;
    const fresh = xp.badges.filter((b) => b.unlocked && !seen.badges.includes(b.id));
    if (xp.level > seen.level) {
      confetti();
      toast(`Level up! Level ${xp.level} · ${xp.title}`, { tone: 'info', duration: 5000 });
    } else if (fresh.length) {
      confetti({ count: 90 });
    }
    fresh.forEach((b) => toast(`Badge unlocked: ${b.name}`, { tone: 'info', duration: 5000 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** One pointer listener drives the spotlight on whichever card is under the cursor. */
function useCardSpotlight() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return undefined;
    let lit = null;
    const onMove = (e) => {
      const card = e.target.closest?.('.card');
      if (lit && lit !== card) lit.classList.remove('is-lit');
      lit = card;
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
      // Only compact cards tilt; big form panels stay put so typing feels stable.
      const small = r.width < 560 && r.height < 460;
      card.classList.toggle('tilt', small);
      if (small) {
        card.style.setProperty('--ry', `${(x / r.width - 0.5) * 7}deg`);
        card.style.setProperty('--rx', `${(0.5 - y / r.height) * 7}deg`);
      }
      card.classList.add('is-lit');
    };
    const onLeave = () => lit?.classList.remove('is-lit');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);
}

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [v, q] = h.split('?');
  return { view: VIEWS.some((x) => x.id === v) ? v : 'dashboard', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

function Shell() {
  const { ready, state } = useStore();
  useEffect(() => {
    document.title = `${state.settings.traderName || 'Trader'} Capital`;
  }, [state.settings.traderName]);
  const [route, setRoute] = useState(parseHash);
  useCardSpotlight();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sj-sidebar') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--sbw', collapsed ? '76px' : '256px');
    try {
      localStorage.setItem('sj-sidebar', collapsed ? '1' : '0');
    } catch { /* ignore */ }
  }, [collapsed]);

  const navigate = useCallback((view, params) => {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    window.location.hash = `/${view}${q}`;
  }, []);

  // Desktop shortcuts: 1-5 switch views when not typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) navigate(v.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span className="h-2 w-2 animate-pulsedot rounded-full bg-emerald-400" /> Loading journal
        </div>
      </div>
    );
  }

  const { view, params } = route;
  const props = { navigate, params };
  const screens = {
    dashboard: <Dashboard {...props} />,
    new: <NewTrade key={params.edit || params.copy || 'new'} {...props} />,
    history: <HistoryView {...props} />,
    calendar: <CalendarView {...props} />,
    discipline: <Discipline {...props} />,
    settings: <Settings {...props} />,
  };

  return (
    <div className="min-h-dvh">
      <HudBackground />
      <BootScreen />
      <AutoBackup />
      <Sidebar view={view} navigate={navigate} collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className="pb-[calc(96px+env(safe-area-inset-bottom))] transition-[padding] duration-300 md:pb-12 md:pl-[var(--sbw)]">
        <MobileHeader view={view} navigate={navigate} />
        <Ticker />
        <ProgressWatcher />
        <div className="mx-auto max-w-[1280px] px-4 py-5 md:px-8 md:py-8">
          <div key={view + (params.edit || '')} className="animate-view">
            <ViewBoundary>{screens[view]}</ViewBoundary>
          </div>
        </div>
      </main>
      <BottomNav view={view} navigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}
