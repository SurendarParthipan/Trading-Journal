import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock, Layers, Wand2, Plus, Trash2, ShieldAlert, Brain, ImagePlus, Link2, Save, RotateCcw, X, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, ClipboardPaste, NotebookPen, ScanText, CheckCircle2, Loader2,
} from 'lucide-react';
import { Card, CardHeader, Field, Modal, PnL, Segmented, cx, useToast } from '../components/ui';
import { groupRows, impliedContract, normalizePair, readTradesFromImage } from '../lib/ocr';
import { PageTitle } from '../components/fx';
import { useJournal } from '../lib/useJournal';
import { normalizeTrade, riskPlan, layerPnl, layerStats } from '../lib/calc';
import { allTags } from '../lib/constants';
import { PAIR_PRESETS } from '../lib/constants';
import { money, num, nowTime, pct, todayStr, uid, priceFmt, lotsFmt, round } from '../lib/format';
import { chartImageFromLink, fileToDataUrl } from '../lib/image';

const DRAFT_KEY = 'sj-draft-v1';
const s = (v) => (v == null ? '' : String(v));

const blankLayer = (lots = '') => ({ id: uid(), price: '', lots: s(lots), exit: '' });

function blankForm(settings, capital) {
  return {
    id: null,
    date: todayStr(),
    time: nowTime(),
    pair: settings.defaultPair || 'XAU/USD',
    direction: 'BUY',
    setup: '',
    capitalBefore: s(capital),
    layers: [blankLayer(settings.defaultLot)],
    exitPrice: '',
    sl: '',
    tp: '',
    fees: '',
    pnlMode: 'auto',
    pnlManual: '',
    tags: [],
    notes: '',
    image: null,
    imageLink: '',
  };
}

function toForm(t, asCopy, settings, capital) {
  return {
    id: asCopy ? null : t.id,
    date: asCopy ? todayStr() : t.date,
    time: asCopy ? nowTime() : t.time,
    pair: t.pair,
    direction: t.direction,
    setup: t.setup,
    capitalBefore: asCopy ? s(capital) : s(t.capitalBefore),
    layers: t.layers.map((l) => ({ id: uid(), price: s(l.price), lots: s(l.lots), exit: asCopy ? '' : s(l.exit) })),
    exitPrice: asCopy ? '' : s(t.exitPrice),
    sl: s(t.sl),
    tp: s(t.tp),
    fees: asCopy ? '' : t.fees ? s(t.fees) : '',
    pnlMode: asCopy ? 'auto' : t.pnlMode,
    pnlManual: asCopy ? '' : s(t.pnlManual),
    tags: asCopy ? [] : [...t.tags],
    notes: asCopy ? '' : t.notes,
    image: asCopy ? null : t.image,
    imageLink: asCopy ? '' : t.imageLink,
    contractSize: asCopy ? settings.contractSize : t.contractSize,
    createdAt: asCopy ? undefined : t.createdAt,
  };
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && Array.isArray(d.layers) ? d : null;
  } catch {
    return null;
  }
}

function Section({ icon, title, eyebrow, right, children, className }) {
  return (
    <Card className={cx('p-4 md:p-5', className)}>
      <CardHeader icon={icon} title={title} eyebrow={eyebrow} right={right} className="mb-4" />
      {children}
    </Card>
  );
}

function NumInput({ value, onChange, placeholder, className, ...rest }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cx('input-mono', className)}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.\-]/g, ''))}
      {...rest}
    />
  );
}

export default function NewTrade({ navigate, params }) {
  const { trades, settings, stats, dispatch, cur } = useJournal();
  const toast = useToast();
  const source = params.edit || params.copy ? trades.find((t) => t.id === (params.edit || params.copy)) : null;
  const editing = !!(params.edit && source);
  const contract = editing ? source.contractSize : settings.contractSize;

  const [form, setForm] = useState(() => {
    if (source) return toForm(source, !!params.copy, settings, stats.capital);
    const draft = loadDraft();
    return draft ? { ...draft, capitalBefore: s(stats.capital) } : blankForm(settings, stats.capital);
  });
  const [scan, setScan] = useState(null); // { busy, progress, rows, error }
  const scanRef = useRef(null);
  const [restoredDraft] = useState(() => !source && !!loadDraft());
  const [builder, setBuilder] = useState({ base: '', step: s(settings.defaultStep), count: '10', lot: s(settings.defaultLot), mode: 'average' });
  const [errors, setErrors] = useState({});
  const [newTag, setNewTag] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const set = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  // Persist unsent drafts so a phone call or app switch never loses a half-typed trade.
  useEffect(() => {
    if (editing || params.copy) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, image: null }));
      } catch { /* ignore */ }
    }
  }, [form, editing, params.copy]);

  const preview = useMemo(() => normalizeTrade({ ...form, fees: 0, contractSize: contract }, contract), [form, contract]);
  // New trades always start from the live dashboard balance (starting capital + journal P&L).
  const capitalBefore = editing ? num(form.capitalBefore) ?? stats.capital : stats.capital;
  const plan = useMemo(() => riskPlan(preview, contract, capitalBefore), [preview, contract, capitalBefore]);
  const ls = layerStats(form.layers);
  // When every layer carries its own exit, the trade's exit is their lot-weighted average.
  const filled = form.layers.filter((l) => num(l.price) != null && num(l.lots) > 0);
  const layersHaveExits = filled.length > 0 && filled.every((l) => num(l.exit) != null);
  const avgExit = layersHaveExits ? filled.reduce((a, l) => a + num(l.exit) * num(l.lots), 0) / filled.reduce((a, l) => a + num(l.lots), 0) : null;
  const tags = allTags(settings);
  const setups = useMemo(() => [...new Set(trades.map((t) => t.setup).filter(Boolean))].slice(0, 30), [trades]);

  /* ----- layers ----- */
  const updateLayer = (id, patch) => set({ layers: form.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLayer = (id) => set({ layers: form.layers.length > 1 ? form.layers.filter((l) => l.id !== id) : [blankLayer(settings.defaultLot)] });
  const addLayer = () => {
    const last = form.layers[form.layers.length - 1];
    const step = num(builder.step) || 0;
    const sign = (form.direction === 'BUY') === (builder.mode === 'average') ? -1 : 1;
    const nextPrice = num(last?.price) != null && step ? s(round(num(last.price) + sign * step, 5)) : '';
    set({ layers: [...form.layers, { ...blankLayer(last?.lots || settings.defaultLot), price: nextPrice }] });
  };

  const generate = () => {
    const base = num(builder.base);
    const step = num(builder.step) ?? 0;
    const count = Math.min(50, Math.max(1, Math.round(num(builder.count) || 0)));
    const lot = num(builder.lot);
    if (base == null || !lot) {
      setErrors((e) => ({ ...e, builder: 'Enter a base price and lot size.' }));
      return;
    }
    // "Average" places layers against the trade (buy lower / sell higher); "Pyramid" adds in the trade's favour.
    const sign = (form.direction === 'BUY') === (builder.mode === 'average') ? -1 : 1;
    const layers = Array.from({ length: count }, (_, i) => ({ id: uid(), price: s(round(base + sign * i * step, 5)), lots: s(lot), exit: '' }));
    set({ layers });
    setErrors((e) => ({ ...e, builder: null, layers: null }));
  };

  /* ----- broker screenshot scan ----- */
  const runScan = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file.', { tone: 'error' });
      return;
    }
    setScan({ busy: true, progress: 0, rows: [] });
    try {
      const { rows } = await readTradesFromImage(file, (p) => setScan((x) => (x ? { ...x, progress: p } : x)));
      if (!rows.length) {
        setScan({ busy: false, rows: [], error: 'No trades found. Use a screenshot of the History tab showing "XAUUSD sell 0.01" rows with entry → exit prices.' });
        return;
      }
      const groupOf = {};
      groupRows(rows).forEach((g, gi) => g.forEach((i) => (groupOf[i] = gi + 1)));
      setScan({ busy: false, rows: rows.map((r, i) => ({ ...r, id: uid(), entry: s(r.entry), exit: s(r.exit), lots: s(r.lots), group: groupOf[i] || 1 })) });
    } catch (e) {
      setScan({ busy: false, rows: [], error: `Could not read the screenshot (${e.message}). The text reader needs internet the first time.` });
    }
  };

  const scanRows = scan?.rows || [];
  const rowPnl = (r) => {
    const [e, x, l] = [num(r.entry), num(r.exit), num(r.lots)];
    return e != null && x != null && l ? (x - e) * (r.direction === 'SELL' ? -1 : 1) * l * contract : null;
  };
  const rowOk = (r) => r.profit == null || rowPnl(r) == null || Math.abs(rowPnl(r) - r.profit) <= 0.05 + Math.abs(r.profit) * 0.01;
  const numericRows = (rows) => rows.map((r) => ({ ...r, entry: num(r.entry), exit: num(r.exit), lots: num(r.lots) }));
  const scanContract = impliedContract(numericRows(scanRows));
  const contractMismatch = scanContract && Math.abs(scanContract - contract) / contract > 0.05;
  const scanGroups = [...new Set(scanRows.map((r) => r.group))]
    .sort((a, b) => a - b)
    .map((g) => {
      const rows = scanRows.filter((r) => r.group === g);
      const direction = rows.filter((r) => r.direction === 'SELL').length >= rows.length / 2 ? 'SELL' : 'BUY';
      const dated = rows.filter((r) => r.ts != null).sort((a, b) => a.ts - b.ts)[0];
      return {
        g,
        rows,
        direction,
        mixed: rows.some((r) => r.direction !== direction),
        pnl: rows.reduce((a, r) => a + (rowPnl(r) || 0), 0),
        lots: rows.reduce((a, r) => a + (num(r.lots) || 0), 0),
        date: dated?.date || null,
        time: dated?.time || null,
        pair: normalizePair(rows.find((r) => r.symbol)?.symbol),
      };
    });
  const anyMixed = scanGroups.some((g) => g.mixed);
  const updateScanRow = (id, patch) => setScan((x) => ({ ...x, rows: x.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const moveRow = (id, to) => {
    const next = to === 'new' ? Math.max(0, ...scanRows.map((r) => r.group)) + 1 : Number(to);
    updateScanRow(id, { group: next });
  };
  const mergeScan = () => setScan((x) => ({ ...x, rows: x.rows.map((r) => ({ ...r, group: r.direction === 'SELL' ? 1 : 2 })) }));
  const autoSplitScan = () =>
    setScan((x) => {
      const groupOf = {};
      groupRows(numericRows(x.rows)).forEach((g, gi) => g.forEach((i) => (groupOf[i] = gi + 1)));
      return { ...x, rows: x.rows.map((r, i) => ({ ...r, group: groupOf[i] || 1 })) };
    });
  const groupLayers = (grp) => grp.rows.map((r) => ({ id: uid(), price: r.entry, lots: r.lots || s(settings.defaultLot), exit: r.exit }));

  /** Load one detected trade into the form so notes, tags and a chart can be added before saving. */
  const applyScan = (grp) => {
    set({
      direction: grp.direction,
      ...(grp.pair ? { pair: grp.pair } : {}),
      layers: groupLayers(grp),
      exitPrice: '',
      pnlMode: 'auto',
      pnlManual: '',
    });
    setErrors((e) => ({ ...e, layers: null }));
    toast(`Filled ${grp.rows.length} layers from screenshot`);
    setScan(null);
  };

  /** Save every detected trade straight to the journal, oldest first, chaining the capital balance. */
  const saveAllScanned = () => {
    const now = new Date().toISOString();
    const ordered = [...scanGroups].sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));
    let bal = stats.capital;
    ordered.forEach((grp) => {
      const layers = groupLayers(grp).filter((l) => num(l.price) != null && num(l.lots) > 0);
      const lots = layers.reduce((a, l) => a + num(l.lots), 0);
      const avgExit = lots && layers.every((l) => num(l.exit) != null) ? layers.reduce((a, l) => a + num(l.exit) * num(l.lots), 0) / lots : null;
      const trade = normalizeTrade(
        {
          date: grp.date || form.date,
          time: grp.time || '',
          pair: grp.pair || form.pair,
          direction: grp.direction,
          setup: form.setup,
          layers,
          exitPrice: avgExit == null ? '' : round(avgExit, 3),
          fees: 0,
          capitalBefore: round(bal, 2),
          tags: [],
          notes: '',
          contractSize: contract,
          createdAt: now,
          updatedAt: now,
        },
        contract,
      );
      dispatch({ type: 'SAVE_TRADE', trade });
      bal += trade.pnl || 0;
    });
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
    toast(`Saved ${ordered.length} trades from screenshot`);
    setScan(null);
    navigate('history');
  };

  /* ----- tags ----- */
  const toggleTag = (name) => set({ tags: form.tags.includes(name) ? form.tags.filter((t) => t !== name) : [...form.tags, name] });
  const addCustomTag = (kind) => {
    const name = newTag.trim();
    if (!name) return;
    if (!tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      dispatch({ type: 'SETTINGS', patch: { customTags: [...(settings.customTags || []), { name, kind }] } });
    }
    const canonical = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())?.name || name;
    if (!form.tags.includes(canonical)) set({ tags: [...form.tags, canonical] });
    setNewTag('');
  };

  /* ----- image ----- */
  const attachFile = useCallback(
    async (file) => {
      if (!file) return;
      setImgBusy(true);
      try {
        set({ image: await fileToDataUrl(file) });
      } catch (e) {
        toast(e.message, { tone: 'error' });
      } finally {
        setImgBusy(false);
      }
    },
    [set, toast],
  );

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        attachFile(item.getAsFile());
        toast('Screenshot pasted from clipboard', { tone: 'info' });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [attachFile, toast]);

  const linkImg = chartImageFromLink(form.imageLink);
  const shownImg = form.image || linkImg;

  /* ----- save ----- */
  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Date is required';
    if (!form.pair.trim()) e.pair = 'Pair is required';
    if (form.pnlMode === 'auto' && !ls.count) e.layers = 'Add at least one layer with price and lots (or switch to manual P&L).';
    if (form.pnlMode === 'manual' && num(form.pnlManual) == null) e.pnlManual = 'Enter the realised P&L';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = () => {
    if (!validate()) {
      toast('Check the highlighted fields', { tone: 'error' });
      return;
    }
    const now = new Date().toISOString();
    const trade = normalizeTrade(
      {
        ...form,
        id: form.id || undefined,
        capitalBefore,
        layers: filled,
        exitPrice: layersHaveExits ? round(avgExit, 3) : form.exitPrice,
        fees: 0,
        contractSize: contract,
        createdAt: form.createdAt || now,
        updatedAt: now,
      },
      contract,
    );
    dispatch({ type: 'SAVE_TRADE', trade });
    if (!editing) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch { /* ignore */ }
    }
    toast(editing ? 'Trade updated' : `Trade logged · ${trade.pnl == null ? 'open' : money(trade.pnl, cur, { sign: true })}`);
    navigate('history', { open: trade.id });
  };

  const reset = () => {
    setForm(blankForm(settings, stats.capital));
    setErrors({});
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  };

  const buy = form.direction === 'BUY';
  const after = preview.pnl != null ? capitalBefore + preview.pnl : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle eyebrow={editing ? 'Amend position' : params.copy ? 'Duplicate position' : 'Execution desk'} title={editing ? 'Edit Position' : 'Log Position'} accent="acc-lime">
        <div className="flex gap-2">
          {editing ? (
            <button type="button" className="btn-ghost" onClick={() => navigate('history', { open: source.id })}>
              <X size={16} /> Cancel
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={reset}>
              <RotateCcw size={16} /> Clear form
            </button>
          )}
        </div>
      </PageTitle>
      <div className="h-5" />

      {restoredDraft && !editing && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-200">
          <NotebookPen size={14} /> Restored your unsaved draft.
        </div>
      )}

      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {/* Basics */}
          <Section icon={CalendarClock} title="Trade basics" className="acc-cyan">
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                { v: 'BUY', label: 'BUY / LONG', icon: TrendingUp, on: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200 shadow-glow-em' },
                { v: 'SELL', label: 'SELL / SHORT', icon: TrendingDown, on: 'border-rose-400/60 bg-rose-500/15 text-rose-200 shadow-glow-ro' },
              ].map(({ v, label, icon: Icon, on }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set({ direction: v })}
                  className={cx('flex h-14 items-center justify-center gap-2 rounded-xl border font-mono text-sm font-semibold tracking-wide transition active:scale-[0.97]', form.direction === v ? on : 'border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-zinc-300')}
                >
                  <Icon size={18} /> {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" className={cx('input-mono', errors.date && 'border-rose-500/60')} value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Time">
                <input type="time" className="input-mono" value={form.time} onChange={(e) => set({ time: e.target.value })} />
              </Field>
              <Field label="Pair" className="col-span-2 sm:col-span-1">
                <input list="pair-presets" className={cx('input-mono uppercase', errors.pair && 'border-rose-500/60')} value={form.pair} onChange={(e) => set({ pair: e.target.value.toUpperCase() })} />
                <datalist id="pair-presets">{PAIR_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="Setup / strategy" className="col-span-2 sm:col-span-1">
                <input list="setup-list" className="input" placeholder="e.g. London breakout" value={form.setup} onChange={(e) => set({ setup: e.target.value })} />
                <datalist id="setup-list">{setups.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
            </div>
            <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
              {PAIR_PRESETS.slice(0, 6).map((p) => (
                <button key={p} type="button" onClick={() => set({ pair: p })} className={cx('chip shrink-0 font-mono !text-xs', form.pair === p ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.06] text-zinc-500')}>
                  {p}
                </button>
              ))}
            </div>
          </Section>

          {/* Layer builder */}
          <Section
            className="acc-lime"
            icon={Layers}
            title="Multi-layer entries"
            right={<span className="num rounded-lg bg-white/[0.04] px-2 py-1 font-mono text-xs text-zinc-400">{ls.count} × · {lotsFmt(ls.lots)} lots</span>}
          >
            <button
              type="button"
              onClick={() => scanRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                runScan(e.dataTransfer.files?.[0]);
              }}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-3 text-left transition hover:bg-sky-500/[0.1] active:scale-[0.99]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-300">
                <ScanText size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-sky-100">Scan broker screenshot</span>
                <span className="block text-xs text-zinc-400">Upload your MT4/MT5 history screenshot. Layers, lots and exits fill in automatically.</span>
              </span>
            </button>
            <input
              ref={scanRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                runScan(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <Wand2 size={14} /> Quick builder
                </span>
                <Segmented
                  size="sm"
                  value={builder.mode}
                  onChange={(mode) => setBuilder((b) => ({ ...b, mode }))}
                  options={[
                    { value: 'average', label: buy ? 'Stack below ↓' : 'Stack above ↑' },
                    { value: 'pyramid', label: buy ? 'Stack above ↑' : 'Stack below ↓' },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Field label="Base price">
                  <NumInput value={builder.base} placeholder="2650.00" onChange={(base) => setBuilder((b) => ({ ...b, base }))} />
                </Field>
                <Field label="Step">
                  <NumInput value={builder.step} placeholder="1.0" onChange={(step) => setBuilder((b) => ({ ...b, step }))} />
                </Field>
                <Field label="Layers">
                  <NumInput value={builder.count} placeholder="10" inputMode="numeric" onChange={(count) => setBuilder((b) => ({ ...b, count }))} />
                </Field>
                <Field label="Lot / layer">
                  <NumInput value={builder.lot} placeholder="0.01" onChange={(lot) => setBuilder((b) => ({ ...b, lot }))} />
                </Field>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {['1', '3', '5', '10'].map((n) => (
                  <button key={n} type="button" onClick={() => setBuilder((b) => ({ ...b, count: n }))} className={cx('chip !px-2.5 !py-1 font-mono !text-xs', builder.count === n ? 'border-emerald-500/40 text-emerald-300' : 'border-white/[0.06] text-zinc-500')}>
                    ×{n}
                  </button>
                ))}
                {['0.01', '0.02', '0.05', '0.1'].map((n) => (
                  <button key={n} type="button" onClick={() => setBuilder((b) => ({ ...b, lot: n }))} className={cx('chip !px-2.5 !py-1 font-mono !text-xs', builder.lot === n ? 'border-emerald-500/40 text-emerald-300' : 'border-white/[0.06] text-zinc-500')}>
                    {n}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-primary mt-3 w-full" onClick={generate}>
                <Wand2 size={16} /> Generate {Math.max(1, Math.round(num(builder.count) || 0))} layers
                {num(builder.lot) ? ` · ${lotsFmt((num(builder.lot) || 0) * Math.max(1, Math.round(num(builder.count) || 0)))} lots` : ''}
              </button>
              {errors.builder && <p className="mt-2 text-xs text-rose-400">{errors.builder}</p>}
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06]">
              <div className="grid grid-cols-[28px_1fr_0.8fr_1fr_28px] gap-2 border-b border-white/[0.06] bg-white/[0.02] px-2.5 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <span>#</span>
                <span>Entry</span>
                <span>Lots</span>
                <span>Exit (opt.)</span>
                <span />
              </div>
              <div className="max-h-[360px] divide-y divide-white/[0.04] overflow-y-auto">
                {form.layers.map((l, i) => {
                  const lp = layerPnl({ price: num(l.price), lots: num(l.lots), exit: num(l.exit) }, { ...preview }, contract);
                  return (
                    <div key={l.id} className="grid grid-cols-[28px_1fr_0.8fr_1fr_28px] items-center gap-2 px-2.5 py-1.5">
                      <span className="font-mono text-xs text-zinc-600">{i + 1}</span>
                      <NumInput className="!px-2.5 !py-2 !text-sm" value={l.price} placeholder="price" onChange={(price) => updateLayer(l.id, { price })} aria-label={`Layer ${i + 1} entry`} />
                      <NumInput className="!px-2.5 !py-2 !text-sm" value={l.lots} placeholder="0.01" onChange={(lots) => updateLayer(l.id, { lots })} aria-label={`Layer ${i + 1} lots`} />
                      <div className="relative">
                        <NumInput className="!px-2.5 !py-2 !text-sm" value={l.exit} placeholder={form.exitPrice || 'exit'} onChange={(exit) => updateLayer(l.id, { exit })} aria-label={`Layer ${i + 1} exit`} />
                        {lp != null && (
                          <span className={cx('pointer-events-none absolute -bottom-0.5 right-2 font-mono text-[9px]', lp >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{money(lp, cur, { sign: true })}</span>
                        )}
                      </div>
                      <button type="button" onClick={() => removeLayer(l.id)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400" aria-label="Remove layer">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={addLayer} className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.06] py-2.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.03] hover:text-white">
                <Plus size={14} /> Add layer
              </button>
            </div>
            {errors.layers && <p className="mt-2 text-xs text-rose-400">{errors.layers}</p>}
            <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">Avg entry</div>
                <div className="num mt-0.5 text-sm text-zinc-100">{ls.avg == null ? '—' : priceFmt(round(ls.avg, 3))}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">Total lots</div>
                <div className="num mt-0.5 text-sm text-zinc-100">{lotsFmt(ls.lots)}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">$/point</div>
                <div className="num mt-0.5 text-sm text-zinc-100">{money(ls.lots * contract, cur)}</div>
              </div>
            </div>
          </Section>

          {/* Psychology */}
          <Section icon={Brain} title="Psychology & mistakes" className="acc-pink">
            <div className="space-y-3">
              {['good', 'bad'].map((kind) => (
                <div key={kind}>
                  <div className="eyebrow mb-2">{kind === 'good' ? 'Strengths' : 'Mistakes'}</div>
                  <div className="flex flex-wrap gap-2">
                    {tags.filter((t) => t.kind === kind).map((t) => {
                      const on = form.tags.includes(t.name);
                      return (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => toggleTag(t.name)}
                          className={cx(
                            'chip',
                            on
                              ? kind === 'good'
                                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                                : 'border-rose-400/50 bg-rose-500/15 text-rose-200'
                              : 'border-white/[0.08] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200',
                          )}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <input className="input min-w-0 !py-2 text-sm" placeholder="Custom tag…" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag('bad'))} />
                <button type="button" className="btn-ghost shrink-0 !px-3 text-rose-300" onClick={() => addCustomTag('bad')} disabled={!newTag.trim()}>
                  + Mistake
                </button>
                <button type="button" className="btn-ghost shrink-0 !px-3 text-emerald-300" onClick={() => addCustomTag('good')} disabled={!newTag.trim()}>
                  + Strength
                </button>
              </div>
              <Field label="Notes">
                <textarea className="input min-h-[96px] resize-y" placeholder="Why did you enter? How did you feel while it was running? What would you repeat or avoid?" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {/* Exit & risk */}
          <Section icon={ShieldAlert} title="Exit & risk" className="acc-amber">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stop loss">
                <NumInput value={form.sl} placeholder="—" onChange={(sl) => set({ sl })} className={plan.slWrongSide ? 'border-amber-500/60' : ''} />
              </Field>
              <Field label="Take profit">
                <NumInput value={form.tp} placeholder="—" onChange={(tp) => set({ tp })} className={plan.tpWrongSide ? 'border-amber-500/60' : ''} />
              </Field>
              {layersHaveExits ? (
                <div className="col-span-2">
                  <span className="label">Exit price (avg)</span>
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-ink-950/60 px-3.5 py-2.5 font-mono">
                    <span className="num text-base text-zinc-100">{priceFmt(round(avgExit, 3))}</span>
                    <span className="text-xs text-zinc-500">from {filled.length} layer exit{filled.length > 1 ? 's' : ''}</span>
                  </div>
                </div>
              ) : (
                <Field label="Exit price" hint="Blank = still open. Or fill exits per layer and it is averaged for you." className="col-span-2">
                  <NumInput value={form.exitPrice} placeholder="avg close" onChange={(exitPrice) => set({ exitPrice })} />
                </Field>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="rounded-lg border border-rose-500/15 bg-rose-500/[0.05] px-3 py-2">
                <div className="text-zinc-500">Risk</div>
                <div className="num mt-0.5 text-sm text-rose-300">{plan.risk > 0 ? money(plan.risk, cur) : '—'}</div>
              </div>
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2">
                <div className="text-zinc-500">Reward</div>
                <div className="num mt-0.5 text-sm text-emerald-300">{plan.reward > 0 ? money(plan.reward, cur) : '—'}</div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">R : R</div>
                <div className={cx('num mt-0.5 text-sm', plan.rr >= 2 ? 'text-emerald-300' : plan.rr != null && plan.rr < 1 ? 'text-amber-300' : 'text-zinc-100')}>{plan.rr == null ? '—' : `1 : ${plan.rr.toFixed(2)}`}</div>
              </div>
            </div>
            {plan.riskPct != null && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between font-mono text-[11px] text-zinc-500">
                  <span>Risk of capital</span>
                  <span className={plan.riskPct > settings.riskWarnPct ? 'text-rose-300' : 'text-zinc-300'}>{pct(plan.riskPct, 2)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cx('h-full rounded-full transition-all', plan.riskPct > settings.riskWarnPct ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, (plan.riskPct / (settings.riskWarnPct * 2)) * 100)}%` }} />
                </div>
              </div>
            )}
            {(plan.slWrongSide || plan.tpWrongSide || plan.riskPct > settings.riskWarnPct) && (
              <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
                <AlertTriangle size={15} className="mt-px shrink-0" />
                <div>
                  {plan.slWrongSide && <div>Stop loss is on the wrong side of your average entry.</div>}
                  {plan.tpWrongSide && <div>Take profit is on the wrong side of your average entry.</div>}
                  {plan.riskPct > settings.riskWarnPct && (
                    <div>
                      Risking more than {settings.riskWarnPct}% of capital.{' '}
                      {!form.tags.includes('Over-leveraged') && (
                        <button type="button" className="underline underline-offset-2" onClick={() => toggleTag('Over-leveraged')}>
                          Tag as over-leveraged
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="label !mb-0">Realised P&L</span>
                <Segmented size="sm" value={form.pnlMode} onChange={(pnlMode) => set({ pnlMode })} options={[{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manual' }]} />
              </div>
              {form.pnlMode === 'manual' ? (
                <NumInput value={form.pnlManual} placeholder="e.g. -12.40" onChange={(pnlManual) => set({ pnlManual })} className={errors.pnlManual ? 'border-rose-500/60' : ''} />
              ) : (
                <p className="text-xs text-zinc-500">
                  (exit − entry) × lots × {contract} per layer. Contract size is set in Settings.
                </p>
              )}
            </div>
          </Section>

          {/* Capital */}
          <Section icon={Wallet} title="Capital balance" className="acc-violet">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-ink-950/60 px-3 py-2.5 font-mono text-sm">
              <span className="text-zinc-500">Before trade</span>
              <span className="num text-zinc-100">{money(capitalBefore, cur)}</span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {editing
                ? 'Balance recorded when this trade was logged.'
                : `Follows your dashboard balance: starting equity ${money(stats.start, cur)} + journal P&L. Change starting equity on the Dashboard.`}
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5 font-mono text-sm">
              <span className="text-zinc-500">After trade</span>
              <span className="num text-zinc-100">
                {after == null ? '—' : money(after, cur)}{' '}
                {after != null && capitalBefore > 0 && <span className={preview.pnl >= 0 ? 'text-gain' : 'text-loss'}>({preview.pnl >= 0 ? '+' : ''}{pct((preview.pnl / capitalBefore) * 100, 2)})</span>}
              </span>
            </div>
          </Section>

          {/* Chart */}
          <Section icon={ImagePlus} title="Chart screenshot" className="acc-cyan">
            {shownImg ? (
              <div className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-black">
                <img src={shownImg} alt="Trade chart" className="max-h-72 w-full object-contain" onError={(e) => (e.currentTarget.style.opacity = 0.2)} />
                <button type="button" onClick={() => set({ image: null, ...(form.image ? {} : { imageLink: '' }) })} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/70 text-zinc-300 backdrop-blur hover:text-rose-400" aria-label="Remove image">
                  <Trash2 size={15} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  attachFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileRef.current?.click()}
                className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition', dragOver ? 'border-emerald-400/60 bg-emerald-500/[0.06]' : 'border-white/[0.12] hover:border-white/[0.24] hover:bg-white/[0.02]')}
              >
                <ImagePlus size={24} className="text-zinc-500" />
                <div className="text-sm text-zinc-300">{imgBusy ? 'Processing…' : 'Tap to upload a TradingView screenshot'}</div>
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <ClipboardPaste size={12} /> or drag & drop / paste (Ctrl+V)
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => attachFile(e.target.files?.[0])} />
            <Field label="TradingView link / image URL" className="mt-3">
              <div className="relative">
                <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input className="input !pl-9 text-sm" placeholder="https://www.tradingview.com/x/…" value={form.imageLink} onChange={(e) => set({ imageLink: e.target.value.trim() })} />
              </div>
            </Field>
          </Section>
        </div>
      </div>

      <Modal open={!!scan} onClose={() => !scan?.busy && setScan(null)} title="Scan broker screenshot" wide>
        {scan?.busy ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 size={28} className="animate-spin text-sky-400" />
            <div className="text-sm text-zinc-300">Reading your trades… {Math.round((scan.progress || 0) * 100)}%</div>
            <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${Math.round((scan.progress || 0) * 100)}%` }} />
            </div>
            <p className="max-w-xs text-center text-xs text-zinc-500">First scan downloads the text reader (~10 MB), then it is cached.</p>
          </div>
        ) : scan?.error ? (
          <div className="flex gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4 text-sm text-rose-200">
            <AlertTriangle size={18} className="shrink-0" /> {scan.error}
          </div>
        ) : scan ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-zinc-300">
                Detected <span className="font-semibold text-white">{scanGroups.length} trade{scanGroups.length > 1 ? 's' : ''}</span> · {scanRows.length} layers
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={mergeScan}>Merge</button>
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={autoSplitScan}>Auto-split</button>
              </div>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              Buys and sells become separate trades, and layers that closed at a different price are treated as a new setup. Use the Trade column to move a row if it guessed wrong.
            </p>
            {contractMismatch && (
              <p className="mb-3 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-2.5 text-xs text-amber-200">
                <AlertTriangle size={14} className="mt-px shrink-0" />
                Your broker's profits imply a contract size of {scanContract}, but Settings uses {contract}. Update it in Settings so P&L matches.
              </p>
            )}
            <div className="max-h-[52dvh] space-y-3 overflow-auto pr-1">
              {scanGroups.map((grp, gi) => {
                const flagged = grp.rows.filter((r) => !rowOk(r)).length;
                return (
                  <div key={grp.g} className={cx('overflow-hidden rounded-xl border', grp.mixed ? 'border-amber-500/40' : 'border-white/[0.08]')}>
                    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-3 py-2">
                      <span className="display text-sm font-bold uppercase tracking-wide text-white">Trade {gi + 1}</span>
                      <span className={cx('rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold', grp.direction === 'BUY' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>{grp.direction}</span>
                      <span className="font-mono text-xs text-zinc-400">
                        {grp.rows.length} × · {lotsFmt(grp.lots)} lots{grp.date ? ` · ${grp.date.slice(5).replace('-', '/')} ${grp.time || ''}` : ''}
                      </span>
                      <PnL value={round(grp.pnl, 2)} cur={cur} className="ml-auto text-sm font-semibold" />
                      <button type="button" className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.06]" disabled={grp.mixed} onClick={() => applyScan(grp)}>
                        Fill form
                      </button>
                    </div>
                    {grp.mixed && <p className="bg-amber-500/[0.06] px-3 py-1.5 text-[11px] text-amber-200">This trade mixes buy and sell rows. Move them so each trade has one direction.</p>}
                    <table className="w-full table-fixed font-mono text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="w-[74px] px-1 py-1.5 text-left font-medium">Trade</th>
                          <th className="px-1 py-1.5 text-left font-medium">Entry</th>
                          <th className="px-1 py-1.5 text-left font-medium">Exit</th>
                          <th className="w-12 px-1 py-1.5 text-left font-medium">Lots</th>
                          <th className="w-[64px] px-1 py-1.5 text-right font-medium">P&L</th>
                          <th className="w-7" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {grp.rows.map((r) => {
                          const p = rowPnl(r);
                          const ok = rowOk(r);
                          return (
                            <tr key={r.id} className={ok ? '' : 'bg-amber-500/[0.06]'}>
                              <td className="px-1 py-1">
                                <select
                                  className="w-full rounded-md border border-white/10 bg-black/40 px-1 py-1.5 text-[11px] text-zinc-200"
                                  value={r.group}
                                  onChange={(e) => moveRow(r.id, e.target.value)}
                                  aria-label="Move to trade"
                                >
                                  {scanGroups.map((o, oi) => (
                                    <option key={o.g} value={o.g}>
                                      {r.direction === 'SELL' ? '▼' : '▲'} T{oi + 1}
                                    </option>
                                  ))}
                                  <option value="new">+ New</option>
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <NumInput className="!px-1.5 !py-1.5 !text-xs" value={r.entry} onChange={(entry) => updateScanRow(r.id, { entry })} aria-label="Entry" />
                              </td>
                              <td className="px-1 py-1">
                                <NumInput className="!px-1.5 !py-1.5 !text-xs" value={r.exit} onChange={(exit) => updateScanRow(r.id, { exit })} aria-label="Exit" />
                              </td>
                              <td className="px-1 py-1">
                                <NumInput className="!px-1.5 !py-1.5 !text-xs" value={r.lots} onChange={(lots) => updateScanRow(r.id, { lots })} aria-label="Lots" />
                              </td>
                              <td className="px-1 py-1 text-right">
                                <span className={cx('num', p == null ? 'text-zinc-500' : p >= 0 ? 'text-gain' : 'text-loss')}>{p == null ? '—' : money(p, cur, { sign: true })}</span>
                                {!ok && <div className="text-[10px] leading-tight text-amber-300">shot {money(r.profit, cur, { sign: true })}</div>}
                              </td>
                              <td className="px-1 py-1">
                                <button type="button" onClick={() => setScan((x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) }))} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400" aria-label="Remove row">
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {flagged > 0 && (
                      <p className="flex items-center gap-1.5 border-t border-white/[0.05] px-3 py-1.5 text-[11px] text-amber-300">
                        <AlertTriangle size={12} /> {flagged} row{flagged > 1 ? 's' : ''} where the screenshot profit doesn't match the prices; P&L uses the prices.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-zinc-500">{scanGroups.length > 1 ? 'Each trade is saved as its own journal entry with the date from the screenshot.' : 'Fill the form to add notes, tags and a chart before saving.'}</span>
              <span className="font-mono text-zinc-400">
                Total <PnL value={round(scanGroups.reduce((a, g) => a + g.pnl, 0), 2)} cur={cur} className="text-sm font-semibold" />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" className="btn-ghost" onClick={() => setScan(null)}>Cancel</button>
              {scanGroups.length > 1 ? (
                <button type="button" className="btn-primary" disabled={anyMixed} onClick={saveAllScanned}>
                  <Save size={16} /> Save {scanGroups.length} trades
                </button>
              ) : (
                <button type="button" className="btn-primary" disabled={!scanRows.length || anyMixed} onClick={() => applyScan(scanGroups[0])}>
                  <CheckCircle2 size={16} /> Fill {scanRows.length} layers
                </button>
              )}
            </div>
          </>
        ) : null}
      </Modal>

      {/* Sticky save bar */}
      <div className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] z-20 mt-5 md:bottom-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-ink-900/90 p-2.5 pl-4 shadow-2xl backdrop-blur-xl">
          <div className="min-w-0 flex-1">
            <div className="eyebrow !text-[9.5px]">Net P&L</div>
            <PnL value={preview.pnl} cur={cur} className={cx('font-display text-2xl font-bold', preview.pnl > 0 ? 'text-grad-gain' : preview.pnl < 0 ? 'text-grad-loss' : '')} />
          </div>
          <button type="button" className="btn-primary h-12 px-6 text-[15px]" onClick={save}>
            <Save size={17} /> {editing ? 'Save changes' : 'Save trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
