// Stav aplikace: výchozí data + úpravy cen uložené v prohlížeči.
import { DEFAULT_MACHINES, DEFAULT_MODELS, DEFAULT_SETTINGS, DEFAULT_USAGE } from './data.js';

const KEY = 'llm-hw-calculator.v1';

function defaults() {
  return structuredClone({
    settings: DEFAULT_SETTINGS,
    machines: DEFAULT_MACHINES,
    models: DEFAULT_MODELS,
  });
}

/** Načte uložené ceny; při chybě nebo nedostupném úložišti vrátí výchozí. */
export function loadPrices() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved) return base;
    return {
      settings: { ...base.settings, ...saved.settings },
      // doplní pole přidaná v novější verzi do strojů uložených dřív
      machines: saved.machines?.length
        ? saved.machines.map((m) => ({ ...base.machines.find((d) => d.id === m.id), ...m }))
        : base.machines,
      models: saved.models?.length ? saved.models : base.models,
    };
  } catch {
    return base;
  }
}

export function savePrices(prices) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prices));
  } catch {
    // úložiště nedostupné (anonymní okno) — úpravy platí jen do reloadu
  }
}

export function resetPrices() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // viz savePrices
  }
  return defaults();
}

export function initialUsage() {
  return { ...DEFAULT_USAGE };
}
