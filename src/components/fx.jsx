import { useEffect, useRef, useState } from 'react';
import { money } from '../lib/format';
import { cx } from './ui';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Light comet that circles the parent card's border. Parent needs `relative` + rounded corners. */
export function Beam({ from = '#10b981', to = '#a7f3d0', speed = 7 }) {
  return <span aria-hidden className="beam" style={{ '--beam-from': from, '--beam-to': to, '--beam-speed': `${speed}s` }} />;
}

/** Rotating rainbow border for hero cards. */
export function Holo() {
  return <span aria-hidden className="holo" />;
}

/** Page header: mono eyebrow with a live dot, then a glitching display title. */
export function PageTitle({ eyebrow, title, accent = 'acc-violet', children }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-3', accent)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-zinc-400">
          <span className="live-dot !h-1.5 !w-1.5" />
          {eyebrow}
        </div>
        <h1 className="display mt-1.5 text-[28px] font-bold uppercase leading-none tracking-wide text-white md:text-[40px]">
          <span className="glitch text-grad-holo" data-text={title}>
            {title}
          </span>
        </h1>
      </div>
      {children}
    </div>
  );
}

/** Animates from the previous value to the new one (ease-out), so numbers "count up" on load and on change. */
export function useCountUp(target, duration = 900) {
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null || !Number.isFinite(target) || reduced()) {
      setV(target);
      return undefined;
    }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const val = a + (target - a) * (1 - (1 - p) ** 3);
      setV(val);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration]);
  return v;
}

/** `glow` renders signed values as gradient neon text; `display` switches to the gaming display font. */
export function CountMoney({ value, cur = '$', sign, className, glow, display }) {
  const raw = useCountUp(value);
  const v = Number.isFinite(raw) ? raw : value;
  const tone = value == null ? 'text-zinc-400' : value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : 'text-zinc-200';
  const g = glow && value ? (value > 0 ? 'text-grad-gain' : 'text-grad-loss') : '';
  const text = value == null ? '—' : money(v, cur, { sign });
  return (
    <span className={cx('num glitch-hover', display ? 'font-display' : 'font-mono', sign && !g ? tone : '', g, className)} data-text={text}>
      {text}
    </span>
  );
}

export function CountNum({ value, decimals = 0, suffix = '', className, display }) {
  const raw = useCountUp(value);
  // The animated value lags one render behind when going from "no value" to a number.
  const v = Number.isFinite(raw) ? raw : value;
  const text = value == null || !Number.isFinite(value) ? '—' : `${v.toFixed(decimals)}${suffix}`;
  return (
    <span className={cx('num glitch-hover', display ? 'font-display' : 'font-mono', className)} data-text={text}>
      {text}
    </span>
  );
}

/** Tiny dependency-free confetti burst on a full-screen canvas. */
export function confetti({ count = 140, colors = ['#34d399', '#6ee7b7', '#38bdf8', '#fbbf24', '#e2e8f0'] } = {}) {
  if (reduced()) return;
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90';
  document.body.appendChild(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 14 - 4,
    s: 4 + Math.random() * 5,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    col: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

const SEGMENTS = 'repeating-linear-gradient(90deg,#000 0 7px,transparent 7px 9px)';

/** Segmented HUD-style XP bar with a moving sheen. */
export function XpBar({ pct, className }) {
  return (
    <div
      className={cx('relative h-2 overflow-hidden rounded-sm bg-white/[0.06]', className)}
      style={{ WebkitMaskImage: SEGMENTS, maskImage: SEGMENTS }}
    >
      <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400 shadow-[0_0_10px_rgba(52,211,153,.6)] transition-[width] duration-700" style={{ width: `${Math.max(3, pct)}%` }}>
        <span className="absolute inset-0 animate-[btn-shimmer_2.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      </div>
    </div>
  );
}
