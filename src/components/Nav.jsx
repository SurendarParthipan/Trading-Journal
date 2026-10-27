import { LayoutDashboard, Plus, LineChart, Flame, Settings, PanelLeftClose, PanelLeftOpen, HardDrive, Zap } from 'lucide-react';
import { CountMoney, XpBar } from './fx';
import { useJournal } from '../lib/useJournal';
import { money, pct } from '../lib/format';
import { cx } from './ui';

// Each section owns a neon colour, used for its icon, active pill and page accents.
export const VIEWS = [
  { id: 'dashboard', label: 'Head Office', short: 'Office', icon: LayoutDashboard, key: '1', color: '#38bdf8' },
  { id: 'new', label: 'Log Position', short: 'Log', icon: Plus, key: '2', color: '#34d399' },
  { id: 'history', label: 'Trade Ledger', short: 'Ledger', icon: LineChart, key: '3', color: '#818cf8' },
  { id: 'discipline', label: 'Discipline & Streaks', short: 'Streaks', icon: Flame, key: '4', color: '#fbbf24' },
  { id: 'settings', label: 'Vault & Settings', short: 'Vault', icon: Settings, key: '5', color: '#94a3b8' },
];

function Logo({ small }) {
  return (
    <div className={cx('relative grid shrink-0 place-items-center rounded-xl', small ? 'h-9 w-9' : 'h-10 w-10')}>
      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400/70 to-sky-500/50 p-[1.5px]">
        <span className="block h-full w-full rounded-[10px] bg-ink-950" />
      </span>
      <svg viewBox="0 0 24 24" className="relative h-[18px] w-[18px]" fill="none" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <defs>
          <linearGradient id="lg" x1="0" x2="1">
            <stop offset="0" stopColor="#6ee7b7" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path d="M3 16l5-5 4 3.5L21 6" />
      </svg>
    </div>
  );
}

/** Avatar with a circular XP ring and level badge. */
function Avatar({ name, level, pct: p, size = 52 }) {
  const initials = (name || 'T').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#34d399, #38bdf8 ${p}%, rgba(255,255,255,0.08) ${p}%)` }} />
      <div className="absolute inset-[3px] grid place-items-center rounded-full bg-gradient-to-br from-slate-700 via-slate-800 to-emerald-900">
        <span className="display text-lg font-bold text-white drop-shadow">{initials}</span>
      </div>
      <span className="display absolute -bottom-1 -right-1 grid h-5 min-w-[20px] place-items-center rounded-md border border-ink-950 bg-emerald-300 px-1 text-[10px] font-bold text-ink-950">
        {level}
      </span>
    </div>
  );
}

function SaveDot() {
  const { saveStatus, sync } = useJournal();
  if (sync.user) {
    const cloud = {
      synced: ['acc-emerald', 'Cloud synced'],
      syncing: ['acc-cyan', 'Syncing…'],
      offline: ['acc-amber', 'Offline · queued'],
      error: ['acc-rose', 'Sync problem'],
    }[sync.status] || ['acc-cyan', 'Connecting…'];
    return (
      <span className={cx('flex items-center gap-2', cloud[0])} title={sync.user.email}>
        <span className="live-dot !h-1.5 !w-1.5" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{cloud[1]}</span>
      </span>
    );
  }
  const map = {
    saved: ['acc-emerald', 'Saved locally'],
    saving: ['acc-amber', 'Saving…'],
    error: ['acc-rose', 'Save failed'],
  };
  const [c, label] = map[saveStatus];
  return (
    <span className={cx('flex items-center gap-2', c)} title={label}>
      <span className="live-dot !h-1.5 !w-1.5" />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</span>
    </span>
  );
}

export function Sidebar({ view, navigate, collapsed, setCollapsed }) {
  const { stats, streak, cur, settings, xp } = useJournal();
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.07] bg-[#0a0e18]/60 backdrop-blur-2xl transition-[width] duration-300 md:flex"
      style={{ width: 'var(--sbw)' }}
    >
      <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-emerald-400/30 to-transparent" />
      <div className={cx('flex h-16 items-center gap-3', collapsed ? 'justify-center px-0' : 'px-5')}>
        <Logo />
        {!collapsed && (
          <div className="min-w-0">
            <div className="display truncate text-[16px] font-bold uppercase tracking-wide text-white">{settings.traderName || 'Trader'} Capital</div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-emerald-300/70">Head office · est. 2026</div>
          </div>
        )}
      </div>

      {!collapsed ? (
        <div className="relative mx-3 mt-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-transparent to-emerald-500/[0.06] p-3.5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-emerald-500/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <Avatar name={settings.traderName} level={xp.level} pct={xp.pct} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{settings.traderName || 'Trader'} <span className="text-[10px] font-medium uppercase tracking-wider text-amber-300">· Boss</span></div>
              <div className="text-xs font-medium text-emerald-300">{xp.title}</div>
              <div className="font-mono text-[10px] text-zinc-500">{xp.into}/{xp.span} XP</div>
            </div>
          </div>
          <XpBar pct={xp.pct} className="relative mt-3" />
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-black/25 px-2.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Equity</div>
              <CountMoney value={stats.capital} cur={cur} display className="block text-[15px] font-semibold text-white" />
              <div className={cx('font-mono text-[10px]', stats.net >= 0 ? 'text-gain' : 'text-loss')}>{stats.growthPct == null ? '' : `${stats.growthPct >= 0 ? '+' : ''}${pct(stats.growthPct)}`}</div>
            </div>
            <div className="rounded-xl bg-black/25 px-2.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Streak</div>
              <div className="display flex items-center gap-1 text-[15px] font-semibold text-amber-200">
                <Flame size={14} className={streak.current ? 'animate-flicker text-orange-400' : 'text-zinc-600'} />
                {streak.current}d
              </div>
              <div className={cx('font-mono text-[10px]', streak.atRisk && streak.current ? 'text-amber-300' : 'text-zinc-500')}>{streak.atRisk && streak.current ? 'at risk' : `best ${streak.best}`}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex justify-center">
          <Avatar name={settings.traderName} level={xp.level} pct={xp.pct} size={44} />
        </div>
      )}

      <nav className={cx('mt-5 flex-1 space-y-1', collapsed ? 'px-2.5' : 'px-3')}>
        {!collapsed && <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">// Navigate</div>}
        {VIEWS.map((v) => {
          const active = view === v.id;
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              type="button"
              title={collapsed ? v.label : undefined}
              onClick={() => navigate(v.id)}
              style={{ '--nc': v.color }}
              className={cx(
                'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl py-2.5 text-sm font-medium transition',
                collapsed ? 'justify-center px-0' : 'px-3',
                active ? 'text-white' : 'text-zinc-400 hover:text-white',
              )}
            >
              <span
                className={cx('absolute inset-0 rounded-xl transition-opacity duration-300', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')}
                style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${v.color} 22%, transparent), transparent 85%)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${v.color} 25%, transparent)` }}
              />
              {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full" style={{ background: v.color, boxShadow: `0 0 14px ${v.color}` }} />}
              <span
                className="relative grid h-8 w-8 place-items-center rounded-lg transition group-hover:scale-110"
                style={{ color: v.color, background: active ? `color-mix(in srgb, ${v.color} 18%, transparent)` : 'transparent', filter: active ? `drop-shadow(0 0 6px ${v.color})` : 'none' }}
              >
                <Icon size={18} />
              </span>
              {!collapsed && (
                <>
                  <span className="relative flex-1 text-left"><span className="glitch-hover" data-text={v.label}>{v.label}</span></span>
                  <kbd className="relative rounded-md border border-white/[0.1] bg-black/20 px-1.5 font-mono text-[10px] text-zinc-500 group-hover:text-zinc-300">{v.key}</kbd>
                </>
              )}
            </button>
          );
        })}
      </nav>

      <div className={cx('border-t border-white/[0.06] py-3', collapsed ? 'px-2.5' : 'px-4')}>
        {!collapsed && (
          <div className="mb-3 flex items-center gap-2 px-1 text-zinc-500">
            <HardDrive size={13} />
            <SaveDot />
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={cx('flex w-full items-center gap-3 rounded-xl py-2 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200', collapsed ? 'justify-center' : 'px-3')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}

export function MobileHeader({ view, navigate }) {
  const { streak, stats, cur, xp, settings } = useJournal();
  const v = VIEWS.find((x) => x.id === view);
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0a0e18]/75 pt-[env(safe-area-inset-top)] backdrop-blur-2xl md:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <button type="button" onClick={() => navigate('discipline')} aria-label={`Level ${xp.level} ${xp.title}`}>
          <Avatar name={settings.traderName} level={xp.level} pct={xp.pct} size={38} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[15px] font-semibold" style={{ color: v?.color }}>
            {v?.label}
          </div>
          <div className="num font-mono text-[11px] text-zinc-400">{money(stats.capital, cur)}</div>
        </div>
        <button
          type="button"
          onClick={() => navigate('discipline')}
          className="flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 font-mono text-xs font-semibold text-emerald-300"
          aria-label={`${xp.into} of ${xp.span} XP`}
        >
          <Zap size={13} className="fill-emerald-300/30" /> {xp.level}
        </button>
        <button
          type="button"
          onClick={() => navigate('discipline')}
          className={cx(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs font-semibold',
            streak.atRisk ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-orange-500/30 bg-orange-500/10 text-orange-300',
          )}
        >
          <Flame size={14} className={streak.current ? 'animate-flicker' : ''} />
          {streak.current}
        </button>
      </div>
    </header>
  );
}

export function BottomNav({ view, navigate }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0a0e18]/90 pb-safe backdrop-blur-2xl md:hidden">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
      <div className="mx-auto grid h-[68px] max-w-lg grid-cols-5 items-center px-2">
        {VIEWS.map((v) => {
          const active = view === v.id;
          const Icon = v.icon;
          if (v.id === 'new') {
            return (
              <button key={v.id} type="button" onClick={() => navigate('new')} className="flex flex-col items-center" aria-label="New trade">
                <span className="relative -mt-8 grid h-[58px] w-[58px] place-items-center rounded-2xl transition active:scale-90">
                  <span className="absolute inset-0 rounded-2xl bg-emerald-400/40 blur-md" />
                  <span className="absolute inset-[3px] rounded-[14px] bg-gradient-to-br from-emerald-300 to-emerald-500" />
                  <Plus size={26} strokeWidth={2.75} className="relative text-ink-950" />
                </span>
                <span className={cx('mt-1 text-[10px] font-semibold', active ? 'text-emerald-300' : 'text-zinc-500')}>{v.short}</span>
              </button>
            );
          }
          return (
            <button
              key={v.id}
              type="button"
              aria-label={v.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(v.id)}
              className="relative flex h-full flex-col items-center justify-center gap-1 transition active:scale-90"
              style={{ color: active ? v.color : '#71717a' }}
            >
              {active && <span className="absolute top-0 h-[2px] w-8 rounded-b-full" style={{ background: v.color, boxShadow: `0 0 12px ${v.color}` }} />}
              <Icon size={21} style={{ filter: active ? `drop-shadow(0 0 6px ${v.color})` : 'none' }} />
              <span className="text-[10px] font-semibold">{v.short}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
