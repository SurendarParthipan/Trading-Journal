import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal, cx, useToast } from './ui';
import { useJournal } from '../lib/useJournal';
import { MOODS } from '../lib/constants';
import { todayStr, relDay } from '../lib/format';

export default function CheckInModal({ open, onClose, date = todayStr() }) {
  const { checkins, settings, dispatch, trades } = useJournal();
  const toast = useToast();
  const existing = checkins[date];
  const rules = settings.rules || [];
  const [ticks, setTicks] = useState({});
  const [mood, setMood] = useState('');
  const [note, setNote] = useState('');
  const tradedToday = trades.filter((t) => t.date === date).length;

  useEffect(() => {
    if (!open) return;
    setTicks(existing?.rules || {});
    setMood(existing?.mood || '');
    setNote(existing?.note || '');
  }, [open, existing]);

  const followed = rules.filter((r) => ticks[r]).length;

  const save = () => {
    dispatch({
      type: 'CHECKIN',
      date,
      entry: { rules: ticks, rulesFollowed: followed, rulesTotal: rules.length, mood, note: note.trim(), at: new Date().toISOString() },
    });
    toast(existing ? 'Check-in updated' : 'Checked in — streak secured');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Daily check-in · ${relDay(date)}`}>
      <p className="-mt-2 mb-4 text-sm text-zinc-500">
        {tradedToday
          ? `${tradedToday} trade${tradedToday > 1 ? 's' : ''} logged today. Rate how you followed your rules.`
          : 'No trades today? Checking in still counts. Sitting out is a decision too.'}
      </p>

      {rules.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="label !mb-0">My rules</span>
            <span className="num font-mono text-xs text-zinc-400">{followed}/{rules.length}</span>
          </div>
          <div className="space-y-2">
            {rules.map((r) => {
              const on = !!ticks[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTicks((t) => ({ ...t, [r]: !on }))}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition',
                    on ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-zinc-100' : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12]',
                  )}
                >
                  <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition', on ? 'border-emerald-400 bg-emerald-500 text-ink-950' : 'border-zinc-600')}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  {r}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-5">
        <span className="label">State of mind</span>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(mood === m ? '' : m)}
              className={cx('chip', mood === m ? 'border-sky-400/40 bg-sky-500/10 text-sky-200' : 'border-white/[0.08] text-zinc-400 hover:text-zinc-200')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Reflection</span>
        <textarea className="input min-h-[84px] resize-y" placeholder="What went well? What will you do differently tomorrow?" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="mt-5 flex gap-3">
        {existing && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              dispatch({ type: 'REMOVE_CHECKIN', date });
              onClose();
            }}
          >
            Remove
          </button>
        )}
        <button type="button" className="btn-primary flex-1" onClick={save}>
          <Check size={16} /> {existing ? 'Update check-in' : 'Complete check-in'}
        </button>
      </div>
    </Modal>
  );
}
