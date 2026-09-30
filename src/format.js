// Formátování částek a objemů pro češtinu.

const nf = (digits) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits });

export const SYMBOL = { CZK: 'Kč', EUR: '€' };

export function toCurrency(czk, cur, s) {
  return cur === 'EUR' ? czk / s.eurCzk : czk;
}

/** Zkrácená částka: 1,2 mil. Kč / 480 tis. € / 950 Kč. */
export function money(czk, cur, s) {
  const v = toCurrency(czk, cur, s);
  const abs = Math.abs(v);
  const sym = SYMBOL[cur];
  if (abs >= 1e6) return `${nf(2).format(v / 1e6)} mil. ${sym}`;
  if (abs >= 1e4) return `${nf(0).format(v / 1e3)} tis. ${sym}`;
  return `${nf(0).format(v)} ${sym}`;
}

/** Cena za 1M tokenů — malé částky potřebují desetinná místa. */
export function perMillion(czk, cur, s) {
  const v = toCurrency(czk, cur, s);
  const digits = v < 10 ? 2 : v < 1000 ? 1 : 0;
  return `${nf(digits).format(v)} ${SYMBOL[cur]}`;
}

/** Objem v milionech tokenů → „850 mil.“ / „1,2 mld.“ */
export function tokens(millions) {
  if (millions >= 1000) return `${nf(1).format(millions / 1000)} mld.`;
  return `${nf(millions < 10 ? 1 : 0).format(millions)} mil.`;
}

export function months(m) {
  return `${nf(1).format(m)} měs.`;
}

export function pct(v) {
  return `${nf(v < 0.1 ? 1 : 0).format(v * 100)} %`;
}

/** Doba odezvy: „3,4 s“ / „42 s“ / „∞“ (fronta nekonečně roste). */
export function seconds(v) {
  if (!Number.isFinite(v)) return '∞';
  return `${nf(v < 10 ? 1 : 0).format(v)} s`;
}
