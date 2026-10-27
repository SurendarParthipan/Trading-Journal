import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { money } from '../lib/format';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Card({ className, children, ...rest }) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ icon: Icon, title, eyebrow, right, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[var(--acc)]" style={{ borderColor: 'color-mix(in srgb, var(--acc) 30%, transparent)', background: 'color-mix(in srgb, var(--acc) 12%, transparent)', boxShadow: '0 0 18px -6px var(--acc)' }}>
            <Icon size={16} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          {title && (
            <div className="display truncate text-[15px] font-semibold uppercase tracking-wide text-zinc-100">
              {typeof title === 'string' ? <span className="glitch-hover" data-text={title}>{title}</span> : title}
            </div>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

export function PnL({ value, cur = '$', className, glow, compact }) {
  const tone = value == null ? 'text-zinc-400' : value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : 'text-zinc-300';
  const g = glow && value ? (value > 0 ? 'glow-text-em' : 'glow-text-ro') : '';
  return <span className={cx('num font-mono', tone, g, className)}>{value == null ? 'Open' : money(value, cur, { sign: true, compact })}</span>;
}

const RESULT_STYLES = {
  WIN: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  LOSS: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  BE: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
  OPEN: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

export function ResultBadge({ result, className }) {
  return (
    <span className={cx('inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider', RESULT_STYLES[result], className)}>
      {result}
    </span>
  );
}

export function DirBadge({ dir }) {
  const buy = dir === 'BUY';
  return (
    <span className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider', buy ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>
      {buy ? 'LONG' : 'SHORT'}
    </span>
  );
}

export function Segmented({ options, value, onChange, className, size = 'md' }) {
  return (
    <div className={cx('inline-flex rounded-xl border border-white/[0.06] bg-ink-950/60 p-1', className)} role="tablist">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cx(
              'flex-1 whitespace-nowrap rounded-lg font-medium transition',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'bg-white/[0.1] text-white shadow-sm ring-1 ring-emerald-400/30' : 'text-zinc-400 hover:text-white',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full border transition', checked ? 'border-emerald-300/60 bg-emerald-500' : 'border-white/10 bg-white/10')}
    >
      <span className={cx('absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function Ring({ value, size = 64, stroke = 6, color = '#10b981', track = 'rgba(255,255,255,0.06)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  // Portal so ancestors with transforms (page transitions) can't trap the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cx(
          'relative max-h-[92dvh] w-full animate-sheet overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-ink-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:rounded-2xl md:pb-5',
          wide ? 'md:max-w-3xl' : 'md:max-w-md',
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700 md:hidden" />
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel = 'Delete', danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-zinc-500">
        <Icon size={24} />
      </div>
      <div className="text-base font-semibold text-zinc-100">{title}</div>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ChartTooltip({ active, payload, label, cur = '$', labelFmt, valueFmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2 shadow-xl backdrop-blur">
      <div className="mb-1 font-mono text-[11px] text-zinc-500">{labelFmt ? labelFmt(label, payload) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-zinc-400">{p.name}</span>
          <span className={cx('num ml-auto pl-3 font-mono font-semibold', p.value < 0 ? 'text-loss' : 'text-zinc-100')}>
            {valueFmt ? valueFmt(p.value, p) : money(p.value, cur)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- toasts ---------- */

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});
  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
  }, []);
  const push = useCallback(
    (msg, opts = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-2), { id, msg, tone: opts.tone || 'success', action: opts.action }]);
      timers.current[id] = setTimeout(() => dismiss(id), opts.duration || 3800);
    },
    [dismiss],
  );
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-sheet items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
              <Icon size={18} className={t.tone === 'error' ? 'text-rose-400' : t.tone === 'info' ? 'text-sky-400' : 'text-emerald-400'} />
              <span className="flex-1 text-sm text-zinc-200">{t.msg}</span>
              {t.action && (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/10"
                  onClick={() => {
                    t.action.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
