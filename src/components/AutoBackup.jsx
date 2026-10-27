import { useEffect, useRef, useState } from 'react';
import { FolderSync } from 'lucide-react';
import { useStore } from '../lib/store';
import { backupBlob, canLinkFolder, requestFolderPermission, stamp, writeToLinkedFolder } from '../lib/backup';
import { todayStr } from '../lib/format';
import { useToast } from './ui';

const AT = 'sj-autobackup-at';
const REQ = 'sj-backup-request-handled';

export const lastAutoBackup = () => {
  try {
    return localStorage.getItem(AT);
  } catch {
    return null;
  }
};

/**
 * Desktop only: a few seconds after any change, rewrites today's journal-auto_YYYY-MM-DD.json in the linked folder.
 * Also writes a separate file when the phone asked for a backup (synced through the cloud).
 */
export default function AutoBackup() {
  const { state, ready } = useStore();
  const toast = useToast();
  const [needPermission, setNeedPermission] = useState(false);
  const handled = useRef(null);

  const run = async (s) => {
    const res = await writeToLinkedFolder(backupBlob(s), `journal-auto_${todayStr()}.json`);
    if (res === 'need-permission') {
      setNeedPermission(true);
      return;
    }
    if (res !== 'written') return;
    setNeedPermission(false);
    try {
      localStorage.setItem(AT, new Date().toISOString());
      if (handled.current == null) handled.current = localStorage.getItem(REQ) || '';
    } catch { /* ignore */ }
    const req = s.meta.backupRequestedAt;
    if (req && req > (handled.current || '')) {
      await writeToLinkedFolder(backupBlob(s), `journal-backup_${stamp()}_from-phone.json`);
      handled.current = req;
      try {
        localStorage.setItem(REQ, req);
      } catch { /* ignore */ }
      toast('Backup requested from your phone saved to your folder');
    }
  };

  useEffect(() => {
    if (!ready || !canLinkFolder()) return undefined;
    const t = setTimeout(() => run(state), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready]);

  if (!needPermission) return null;
  return (
    <div className="fixed right-4 top-4 z-[70] hidden max-w-xs animate-sheet items-center gap-3 rounded-2xl border border-amber-400/30 bg-ink-900/95 p-3 shadow-2xl backdrop-blur md:flex">
      <FolderSync size={18} className="shrink-0 text-amber-300" />
      <div className="text-xs text-zinc-300">Auto-backup to your folder is paused until you allow access again.</div>
      <button
        type="button"
        className="btn-primary !px-3 !py-1.5 text-xs"
        onClick={async () => {
          if (await requestFolderPermission()) run(state);
        }}
      >
        Allow
      </button>
    </div>
  );
}
