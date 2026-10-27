import { idbGet, idbSet, idbDel } from './idb';
import { layerStats, newestFirst, resultOf } from './calc';
import { todayStr } from './format';

const DIR_KEY = 'backupDir';

export const canLinkFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function getLinkedFolder() {
  try {
    return (await idbGet(DIR_KEY)) || null;
  } catch {
    return null;
  }
}

export async function linkFolder() {
  const handle = await window.showDirectoryPicker({ id: 'surendar-journal-backups', mode: 'readwrite' });
  await idbSet(DIR_KEY, handle);
  return handle;
}

export const unlinkFolder = () => idbDel(DIR_KEY);

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Writes into the linked folder when possible, otherwise falls back to a normal download. */
async function saveFile(blob, filename) {
  const dir = await getLinkedFolder();
  if (dir) {
    try {
      let perm = await dir.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const fh = await dir.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        return { where: 'folder', folder: dir.name, filename };
      }
    } catch { /* fall through to download */ }
  }
  download(blob, filename);
  return { where: 'download', filename };
}

/**
 * Writes straight into the linked folder without prompting.
 * Returns 'written', 'no-folder', or 'need-permission' (browser wants a click before writing again).
 */
export async function writeToLinkedFolder(blob, filename) {
  const dir = await getLinkedFolder();
  if (!dir) return 'no-folder';
  try {
    if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') return 'need-permission';
    const fh = await dir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return 'written';
  } catch {
    return 'need-permission';
  }
}

export async function requestFolderPermission() {
  const dir = await getLinkedFolder();
  if (!dir) return false;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export function backupBlob(state) {
  const payload = {
    app: 'surendar-journal',
    version: 1,
    exportedAt: new Date().toISOString(),
    trades: state.trades,
    cashflows: state.cashflows,
    checkins: state.checkins,
    settings: state.settings,
    meta: state.meta,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export const stamp = () => `${todayStr()}_${new Date().toTimeString().slice(0, 5).replace(':', '')}`;

export function exportJSON(state) {
  return saveFile(backupBlob(state), `journal-backup_${stamp()}.json`);
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCSV(trades) {
  const head = [
    'Date', 'Time', 'Pair', 'Direction', 'Setup', 'Layers', 'Total Lots', 'Avg Entry', 'Exit',
    'Stop Loss', 'Take Profit', 'Planned R:R', 'Risk', 'Fees', 'Net P&L', 'Result', 'Capital Before',
    'Tags', 'Notes', 'Chart Link', 'Layer Detail (entry x lots @ exit)', 'ID',
  ];
  const rows = newestFirst(trades).map((t) => {
    const ls = layerStats(t.layers);
    return [
      t.date, t.time, t.pair, t.direction, t.setup, ls.count, ls.lots, ls.avg?.toFixed(3), t.exitPrice,
      t.sl, t.tp, t.rr, t.risk, t.fees, t.pnl, resultOf(t), t.capitalBefore,
      t.tags.join('; '), t.notes, t.imageLink,
      t.layers.map((l) => `${l.price} x ${l.lots}${l.exit != null ? ` @ ${l.exit}` : ''}`).join(' | '),
      t.id,
    ].map(csvCell).join(',');
  });
  // BOM so Excel opens it as UTF-8
  const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  return saveFile(blob, `journal-trades_${stamp()}.csv`);
}

export async function readBackupFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (Array.isArray(data)) data = { trades: data };
  if (!data || !Array.isArray(data.trades)) throw new Error('No trades found in this file.');
  return data;
}
