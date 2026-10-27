import { useEffect, useRef, useState } from 'react';
import {
  User, FileJson, FileSpreadsheet, Upload, FolderOpen, FolderCheck, HardDrive, ShieldCheck, ListChecks, Tag, Trash2, Plus,
  AlertTriangle, X, Clock, Flame, Smartphone,
} from 'lucide-react';
import { Card, CardHeader, Field, Modal, Segmented, Toggle, cx, useToast } from '../components/ui';
import { PageTitle } from '../components/fx';
import CashflowModal from '../components/Cashflow';
import CloudSyncCard from '../components/CloudSync';
import { lastAutoBackup } from '../components/AutoBackup';
import { ArrowLeftRight } from 'lucide-react';
import { useJournal } from '../lib/useJournal';
import { DEFAULT_TAGS } from '../lib/constants';
import { canLinkFolder, exportCSV, exportJSON, getLinkedFolder, linkFolder, readBackupFile, unlinkFolder } from '../lib/backup';
import { money, num, timeAgo } from '../lib/format';

function NumberSetting({ label, hint, value, onCommit, prefix }) {
  const [v, setV] = useState(String(value ?? ''));
  useEffect(() => setV(String(value ?? '')), [value]);
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-500">{prefix}</span>}
        <input
          className={cx('input-mono', prefix && '!pl-8')}
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={() => {
            const n = num(v);
            if (n != null && n !== value) onCommit(n);
            else setV(String(value ?? ''));
          }}
        />
      </div>
    </Field>
  );
}

export default function Settings() {
  const { state, settings, trades, checkins, meta, dispatch, stats, cur, persisted, cashflows } = useJournal();
  const toast = useToast();
  const fileRef = useRef(null);
  const [folder, setFolder] = useState(null);
  const [pending, setPending] = useState(null);
  const [importMode, setImportMode] = useState('merge');
  const [newRule, setNewRule] = useState('');
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);

  useEffect(() => {
    getLinkedFolder().then(setFolder);
  }, []);

  const patch = (p) => dispatch({ type: 'SETTINGS', patch: p });
  const sizeKB = Math.round(new Blob([JSON.stringify(state)]).size / 1024);
  const backupAge = meta.lastBackupAt ? (Date.now() - new Date(meta.lastBackupAt).getTime()) / 86400000 : Infinity;

  const runExport = async (kind) => {
    setBusy(true);
    try {
      const res = kind === 'json' ? await exportJSON(state) : await exportCSV(trades);
      if (kind === 'json') dispatch({ type: 'META', patch: { lastBackupAt: new Date().toISOString() } });
      toast(res.where === 'folder' ? `Saved ${res.filename} to “${res.folder}”` : `Downloaded ${res.filename}`);
    } catch (e) {
      toast(e.message || 'Export failed', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readBackupFile(file);
      setPending({ data, name: file.name });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const confirmImport = () => {
    dispatch({ type: 'IMPORT', data: pending.data, mode: importMode });
    toast(`Imported ${pending.data.trades.length} trades (${importMode})`);
    setPending(null);
  };

  const doLink = async () => {
    try {
      setFolder(await linkFolder());
      toast('Backup folder linked');
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, { tone: 'error' });
    }
  };

  const customTags = settings.customTags || [];
  const rules = settings.rules || [];

  return (
    <div className="stagger mx-auto max-w-4xl space-y-5">
      <PageTitle eyebrow="Capital, backups & preferences" title="The Vault" accent="acc-pink" />

      <CloudSyncCard />

      {/* Backup */}
      <Card className="acc-emerald overflow-hidden p-4 md:p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <CardHeader
          icon={HardDrive}
          eyebrow="Backup & restore"
          title={`${trades.length} trades · ${Object.keys(checkins).length} check-ins · ${sizeKB.toLocaleString()} KB`}
        />
        <div className={cx('mt-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm', backupAge > 7 ? 'border-amber-500/20 bg-amber-500/[0.06] text-amber-200' : 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-200')}>
          <Clock size={15} className="shrink-0" />
          Last JSON backup: {timeAgo(meta.lastBackupAt)}
          {backupAge > 7 && trades.length > 0 && ' — time for a fresh one.'}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button type="button" disabled={busy} onClick={() => runExport('json')} className="group flex flex-col items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4 text-left transition hover:bg-emerald-500/[0.12] active:scale-[0.98]">
            <FileJson size={22} className="text-emerald-400" />
            <div>
              <div className="font-semibold text-white">Export JSON Backup</div>
              <div className="text-xs text-zinc-400">Everything incl. screenshots. Use this to restore.</div>
            </div>
          </button>
          <button type="button" disabled={busy || !trades.length} onClick={() => runExport('csv')} className="flex flex-col items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06] active:scale-[0.98] disabled:opacity-40">
            <FileSpreadsheet size={22} className="text-sky-400" />
            <div>
              <div className="font-semibold text-white">Export CSV</div>
              <div className="text-xs text-zinc-400">Trades table for Excel / Google Sheets.</div>
            </div>
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06] active:scale-[0.98]">
            <Upload size={22} className="text-violet-400" />
            <div>
              <div className="font-semibold text-white">Import Backup File</div>
              <div className="text-xs text-zinc-400">Restore or merge a .json backup.</div>
            </div>
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onPickFile} />
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.06] bg-ink-950/50 p-3.5">
          {canLinkFolder() ? (
            <div className="flex flex-wrap items-center gap-3">
              {folder ? <FolderCheck size={18} className="text-emerald-400" /> : <FolderOpen size={18} className="text-zinc-500" />}
              <div className="min-w-0 flex-1 text-sm">
                {folder ? (
                  <>
                    Exports save straight into <span className="font-mono text-emerald-300">{folder.name}</span>, and this PC auto-saves <span className="font-mono">journal-auto_&lt;date&gt;.json</span> there after every change
                    {lastAutoBackup() && <span className="text-zinc-500"> · last {timeAgo(lastAutoBackup())}</span>}
                  </>
                ) : (
                  <>
                    Link the <span className="font-mono text-zinc-200">Surendar Journal Program/backups</span> folder so exports land there in one tap.
                  </>
                )}
              </div>
              {folder ? (
                <button
                  type="button"
                  className="btn-ghost !py-1.5 text-xs"
                  onClick={async () => {
                    await unlinkFolder();
                    setFolder(null);
                  }}
                >
                  Unlink
                </button>
              ) : (
                <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={doLink}>
                  <FolderOpen size={14} /> Link backup folder
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 text-sm text-zinc-400">
              <Smartphone size={18} className="mt-0.5 shrink-0 text-zinc-500" />
              This browser saves exports to Downloads. Move them into the Surendar Journal Program/backups folder (or use Chrome/Edge on desktop to save there directly).
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
          <ShieldCheck size={14} className={persisted ? 'text-emerald-400' : 'text-zinc-500'} />
          {persisted ? 'Persistent storage granted: the browser will not auto-clear this journal.' : 'Data is saved instantly in this browser (IndexedDB). Export regularly; clearing site data erases it.'}
        </div>
      </Card>

      {/* Account */}
      <Card className="acc-cyan p-4 md:p-5">
        <CardHeader icon={User} eyebrow="Account & trading defaults" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <input className="input" value={settings.traderName} onChange={(e) => patch({ traderName: e.target.value })} />
          </Field>
          <Field label="Currency symbol">
            <Segmented className="w-full" value={settings.currency} onChange={(currency) => patch({ currency })} options={['$', '¢', '₹', '€', '£']} />
          </Field>
          <NumberSetting
            label="Starting capital"
            prefix={cur}
            value={settings.startingCapital}
            onCommit={(startingCapital) => patch({ startingCapital })}
            hint={`Current balance: ${money(stats.capital, cur)}`}
          />
          <NumberSetting
            label="Contract size (units per 1.00 lot)"
            value={settings.contractSize}
            onCommit={(contractSize) => patch({ contractSize })}
            hint="XAU/USD = 100 oz. Applies to new trades; logged trades keep theirs."
          />
          <Field label="Default pair">
            <input className="input-mono uppercase" value={settings.defaultPair} onChange={(e) => patch({ defaultPair: e.target.value.toUpperCase() })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting label="Default lot" value={settings.defaultLot} onCommit={(defaultLot) => patch({ defaultLot })} />
            <NumberSetting label="Default step" value={settings.defaultStep} onCommit={(defaultStep) => patch({ defaultStep })} />
          </div>
          <NumberSetting label="Risk warning above (% of capital)" value={settings.riskWarnPct} onCommit={(riskWarnPct) => patch({ riskWarnPct })} />
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
            <div className="flex items-center gap-3">
              <Flame size={17} className="text-orange-400" />
              <div>
                <div className="text-sm text-zinc-200">Weekends count for streak</div>
                <div className="text-xs text-zinc-500">Off: Sat/Sun never break a streak</div>
              </div>
            </div>
            <Toggle checked={settings.countWeekends} onChange={(countWeekends) => patch({ countWeekends })} label="Weekends count for streak" />
          </div>
        </div>
      </Card>

      {/* Deposits & withdrawals */}
      <Card className="acc-amber p-4 md:p-5">
        <CardHeader
          icon={ArrowLeftRight}
          eyebrow="Deposits & withdrawals"
          title={`Balance ${money(stats.capital, cur)}`}
          right={
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setCashOpen(true)}>
              <Plus size={14} /> Add
            </button>
          }
        />
        <p className="mt-3 text-xs text-zinc-500">
          Balance = starting equity {money(stats.start, cur)} + trading P&L {money(stats.net, cur, { sign: true })} + cash in/out {money(stats.cashNet, cur, { sign: true })}. Cash movements never count as wins, losses or drawdown.
        </p>
        <div className="mt-3 divide-y divide-white/[0.05]">
          {cashflows.length === 0 && <p className="py-3 text-sm text-zinc-500">No deposits or withdrawals recorded.</p>}
          {[...cashflows].sort((a, b) => (a.date < b.date ? 1 : -1)).map((c) => {
            const signed = c.type === 'withdrawal' ? -c.amount : c.type === 'deposit' ? c.amount : c.amount;
            return (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                <span className={cx('w-24 shrink-0 rounded-md px-2 py-0.5 text-center font-mono text-[10px] font-semibold uppercase tracking-wider', c.type === 'withdrawal' ? 'bg-amber-500/15 text-amber-300' : c.type === 'deposit' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300')}>
                  {c.type === 'adjustment' ? 'correction' : c.type}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-zinc-400">{c.date}</div>
                  {c.note && <div className="truncate text-xs text-zinc-500">{c.note}</div>}
                </div>
                <span className={cx('num font-mono text-sm font-semibold', signed >= 0 ? 'text-gain' : 'text-amber-300')}>{money(signed, cur, { sign: true })}</span>
                <button type="button" onClick={() => dispatch({ type: 'DELETE_CASHFLOW', id: c.id })} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400" aria-label="Delete entry">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </Card>
      <CashflowModal open={cashOpen} onClose={() => setCashOpen(false)} />

      {/* Rules */}
      <Card className="acc-violet p-4 md:p-5">
        <CardHeader icon={ListChecks} eyebrow="My trading rules" title="Checked during each daily check-in" />
        <div className="mt-4 space-y-2">
          {rules.map((r, i) => (
            <div key={r} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <span className="font-mono text-xs text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 text-sm text-zinc-300">{r}</span>
              <button type="button" onClick={() => patch({ rules: rules.filter((x) => x !== r) })} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400" aria-label={`Remove rule ${r}`}>
                <X size={14} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              const r = newRule.trim();
              if (r && !rules.includes(r)) patch({ rules: [...rules, r] });
              setNewRule('');
            }}
          >
            <input className="input min-w-0 text-sm" placeholder="Add a rule, e.g. No trades during news" value={newRule} onChange={(e) => setNewRule(e.target.value)} />
            <button type="submit" className="btn-ghost shrink-0" disabled={!newRule.trim()}>
              <Plus size={15} /> Add
            </button>
          </form>
        </div>
      </Card>

      {/* Tags */}
      <Card className="acc-pink p-4 md:p-5">
        <CardHeader icon={Tag} eyebrow="Psychology tags" />
        <div className="mt-4 flex flex-wrap gap-2">
          {DEFAULT_TAGS.map((t) => (
            <span key={t.name} className={cx('chip cursor-default', t.kind === 'good' ? 'border-emerald-500/20 text-emerald-300/80' : 'border-rose-500/20 text-rose-300/80')}>
              {t.name}
            </span>
          ))}
          {customTags.map((t) => (
            <span key={t.name} className={cx('chip', t.kind === 'good' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200')}>
              {t.name}
              <button type="button" onClick={() => patch({ customTags: customTags.filter((x) => x.name !== t.name) })} aria-label={`Remove tag ${t.name}`} className="-mr-1 rounded-full p-0.5 hover:bg-white/10">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">Add custom tags from the New Trade form. Removing one here keeps it on past trades.</p>
      </Card>

      {/* Danger */}
      <Card className="acc-rose border-rose-500/20 p-4 md:p-5">
        <CardHeader icon={AlertTriangle} eyebrow="Danger zone" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-zinc-400">Erase every trade, check-in and setting. If cloud sync is on, this also erases them on your other devices. Export a JSON backup first.</p>
          <button type="button" className="btn-danger" onClick={() => setWipeOpen(true)}>
            <Trash2 size={15} /> Erase all data
          </button>
        </div>
      </Card>

      <Modal open={!!pending} onClose={() => setPending(null)} title="Import backup">
        {pending && (
          <>
            <p className="text-sm text-zinc-400">
              <span className="font-mono text-zinc-200">{pending.name}</span> contains <span className="text-white">{pending.data.trades.length}</span> trades
              {pending.data.checkins ? ` and ${Object.keys(pending.data.checkins).length} check-ins` : ''}.
            </p>
            <div className="mt-4 space-y-2">
              {[
                { v: 'merge', t: 'Merge', d: 'Add new trades and keep the newest version of duplicates. Your settings stay.' },
                { v: 'replace', t: 'Replace everything', d: 'Wipe the current journal and load this backup exactly.' },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => setImportMode(o.v)} className={cx('w-full rounded-xl border p-3 text-left transition', importMode === o.v ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-white/[0.06] hover:border-white/[0.12]')}>
                  <div className="text-sm font-medium text-white">{o.t}</div>
                  <div className="text-xs text-zinc-500">{o.d}</div>
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="btn-ghost" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className={importMode === 'replace' ? 'btn-danger' : 'btn-primary'} onClick={confirmImport}>
                <Upload size={15} /> Import
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={wipeOpen}
        onClose={() => {
          setWipeOpen(false);
          setWipeText('');
        }}
        title="Erase all data?"
      >
        <p className="text-sm text-zinc-400">
          This permanently removes {trades.length} trades and {Object.keys(checkins).length} check-ins from this browser. Type <span className="font-mono text-rose-300">DELETE</span> to confirm.
        </p>
        <input className="input-mono mt-4" value={wipeText} onChange={(e) => setWipeText(e.target.value)} placeholder="DELETE" autoFocus />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="btn-ghost" onClick={() => setWipeOpen(false)}>Cancel</button>
          <button
            type="button"
            className="btn-danger"
            disabled={wipeText !== 'DELETE'}
            onClick={() => {
              dispatch({ type: 'RESET' });
              setWipeOpen(false);
              setWipeText('');
              toast('Journal erased', { tone: 'info' });
            }}
          >
            Erase
          </button>
        </div>
      </Modal>
    </div>
  );
}
