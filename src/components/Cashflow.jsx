import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import { Field, Modal, Segmented, cx, useToast } from './ui';
import { useJournal } from '../lib/useJournal';
import { normalizeCashflow } from '../lib/calc';
import { money, num, round, todayStr } from '../lib/format';

const TYPES = [
  { value: 'withdrawal', label: 'Withdraw' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'adjustment', label: 'Correct balance' },
];

/**
 * Records money moving in or out of the account. These change the balance but never
 * count as trading profit or loss, so win rate, P&L and drawdown stay about trading only.
 */
export default function CashflowModal({ open, onClose, initialType = 'withdrawal' }) {
  const { stats, cur, dispatch } = useJournal();
  const toast = useToast();
  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setAmount('');
    setDate(todayStr());
    setNote('');
  }, [open, initialType]);

  const value = num(amount);
  // For a correction the user types the broker's balance; we store the difference.
  const delta = value == null ? null : type === 'withdrawal' ? -Math.abs(value) : type === 'deposit' ? Math.abs(value) : round(value - stats.capital, 2);
  const after = delta == null ? null : round(stats.capital + delta, 2);
  const valid = delta != null && (type === 'adjustment' ? delta !== 0 : value > 0);

  const save = () => {
    const entry = normalizeCashflow({ type, amount: type === 'adjustment' ? delta : Math.abs(value), date, note: note.trim() });
    dispatch({ type: 'ADD_CASHFLOW', entry });
    toast(type === 'withdrawal' ? `Withdrawal of ${money(Math.abs(value), cur)} recorded` : type === 'deposit' ? `Deposit of ${money(value, cur)} recorded` : `Balance corrected to ${money(after, cur)}`);
    onClose();
  };

  const Icon = type === 'withdrawal' ? ArrowUpFromLine : type === 'deposit' ? ArrowDownToLine : Scale;

  return (
    <Modal open={open} onClose={onClose} title="Deposit / withdraw">
      <Segmented className="w-full" value={type} onChange={setType} options={TYPES} />
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        {type === 'adjustment'
          ? 'Type the balance your MT5 shows right now. The difference is recorded as a correction, not as trading P&L.'
          : 'Changes your balance only. It never counts as a win, loss or drawdown.'}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={type === 'adjustment' ? 'Broker balance' : 'Amount'} className="col-span-2 sm:col-span-1">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-500">{cur}</span>
            <input
              autoFocus
              inputMode="decimal"
              className="input-mono !pl-8"
              placeholder={type === 'adjustment' ? String(stats.capital) : '0.00'}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
        </Field>
        <Field label="Date" className="col-span-2 sm:col-span-1">
          <input type="date" className="input-mono" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note (optional)" className="col-span-2">
          <input className="input" placeholder={type === 'withdrawal' ? 'e.g. Weekly payout' : ''} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 font-mono text-xs">
        <div>
          <div className="text-zinc-500">Now</div>
          <div className="num mt-0.5 text-sm text-zinc-200">{money(stats.capital, cur)}</div>
        </div>
        <div>
          <div className="text-zinc-500">Change</div>
          <div className={cx('num mt-0.5 text-sm', delta == null ? 'text-zinc-500' : delta >= 0 ? 'text-gain' : 'text-loss')}>{delta == null ? '—' : money(delta, cur, { sign: true })}</div>
        </div>
        <div>
          <div className="text-zinc-500">After</div>
          <div className="num mt-0.5 text-sm text-white">{after == null ? '—' : money(after, cur)}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!valid} onClick={save}>
          <Icon size={16} /> {type === 'withdrawal' ? 'Record withdrawal' : type === 'deposit' ? 'Record deposit' : 'Correct balance'}
        </button>
      </div>
    </Modal>
  );
}
