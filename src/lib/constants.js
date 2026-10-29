export const DEFAULT_TAGS = [
  { name: 'Disciplined', kind: 'good' },
  { name: 'Followed Plan', kind: 'good' },
  { name: 'Patient Entry', kind: 'good' },
  { name: 'FOMO', kind: 'bad' },
  { name: 'Left Chart Unattended', kind: 'bad' },
  { name: 'Scared of Big Drop', kind: 'bad' },
  { name: 'Over-leveraged', kind: 'bad' },
  { name: 'Revenge Trade', kind: 'bad' },
  { name: 'Moved SL', kind: 'bad' },
  { name: 'Early Exit', kind: 'bad' },
];

export const PAIR_PRESETS = ['XAU/USD', 'XAG/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'NAS100', 'US30'];

export const DEFAULT_RULES = [
  'Waited for my setup to confirm before entering',
  'Stop Loss placed before the first layer',
  'Risked 2% or less of capital',
  'Never left layered positions unattended',
  'Stopped after 2 losses in a day',
];

export const MOODS = ['Calm', 'Focused', 'Anxious', 'Frustrated', 'Overconfident'];

export const MILESTONES = [3, 7, 14, 21, 30, 50, 100];

export const DEFAULT_SETTINGS = {
  traderName: 'Surendar',
  startingCapital: 1000,
  currency: '$',
  contractSize: 100,
  defaultPair: 'XAU/USD',
  defaultLot: 0.01,
  defaultStep: 1,
  riskWarnPct: 2,
  countWeekends: false,
  weeklyTargetPct: 0,
  customTags: [],
  rules: DEFAULT_RULES,
};

export function allTags(settings) {
  const seen = new Set(DEFAULT_TAGS.map((t) => t.name));
  return [...DEFAULT_TAGS, ...(settings.customTags || []).filter((t) => !seen.has(t.name))];
}

export function tagKind(name, settings) {
  return allTags(settings).find((t) => t.name === name)?.kind || 'bad';
}

/** Tags not in the catalogue (e.g. typed on an old trade) are treated as mistakes. */
export function isMistake(name, settings) {
  return tagKind(name, settings) === 'bad';
}
