import { Sparkles, NotebookPen, Library, Shield, Flame, Crown, ShieldCheck, ShieldAlert, Image, Layers, CalendarCheck, TrendingUp, Lock } from 'lucide-react';
import { cx } from './ui';

const ICONS = { Sparkles, NotebookPen, Library, Shield, Flame, Crown, ShieldCheck, ShieldAlert, Image, Layers, CalendarCheck, TrendingUp };

export function BadgeIcon({ badge, size = 'md' }) {
  const Icon = ICONS[badge.icon] || Sparkles;
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  return (
    <span
      className={cx(
        'relative grid shrink-0 place-items-center rounded-xl border',
        dim,
        badge.unlocked
          ? 'border-amber-300/40 bg-gradient-to-br from-amber-400/25 via-amber-500/10 to-transparent text-amber-200 shadow-[0_0_18px_-4px_rgba(251,191,36,.6)]'
          : 'border-white/[0.06] bg-white/[0.02] text-zinc-700',
      )}
      title={`${badge.name}: ${badge.desc}`}
    >
      {badge.unlocked ? <Icon size={size === 'sm' ? 16 : 20} /> : <Lock size={size === 'sm' ? 13 : 16} />}
    </span>
  );
}

export function BadgeTile({ badge }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-xl border p-3 transition', badge.unlocked ? 'border-amber-400/20 bg-amber-400/[0.04]' : 'border-white/[0.05] bg-white/[0.015]')}>
      <BadgeIcon badge={badge} />
      <div className="min-w-0">
        <div className={cx('truncate text-sm font-semibold', badge.unlocked ? 'text-amber-100' : 'text-zinc-500')}>{badge.name}</div>
        <div className="truncate text-xs text-zinc-500">{badge.desc}</div>
      </div>
    </div>
  );
}
