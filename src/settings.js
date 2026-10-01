// Dialog Nastavení: obecné parametry, stroje, modely a předplatné. Edituje kopii, uloží až potvrzením.
import { PRICES_AS_OF } from './data.js';

const GENERAL = [
  ['eurCzk', 'Kurz EUR', 'Kč'],
  ['electricityCzkKwh', 'Cena elektřiny', 'Kč/kWh'],
  ['pue', 'PUE (chlazení, ztráty)', '×'],
  ['fteCzkMonth', 'Cena úvazku MLOps', 'Kč/měs.'],
  ['maxUtilPct', 'Max. vytížení stroje', '%'],
  ['idleSharePct', 'Příkon naprázdno', '% max.'],
  ['horizonMonths', 'Horizont (životnost HW)', 'měs.'],
  ['cacheSharePct', 'Vstup z prompt cache (API)', '%'],
  ['apiDeclinePctYear', 'Pokles cen API', '%/rok'],
];

const MACHINE_COLS = [
  ['name', 'Stroj', 'text'],
  ['priceEur', 'Cena EUR'],
  ['kw', 'kW'],
  ['prefillTps', 'Prefill tok/s'],
  ['decodeTps', 'Decode tok/s'],
  ['streamTps', 'Tok/s na uživatele'],
  ['maxConcurrent', 'Souběh/ks'],
  ['maxUnits', 'Max. ks'],
  ['fte', 'Úvazek'],
  ['maintenancePct', 'Servis %/rok'],
  ['housingCzk', 'Housing Kč/měs.'],
];

const MODEL_COLS = [
  ['provider', 'Poskytovatel', 'text'],
  ['name', 'Model', 'text'],
  ['in', 'Vstup €/1M'],
  ['cached', 'Cache €/1M'],
  ['out', 'Výstup €/1M'],
];

const PLAN_COLS = [
  ['provider', 'Poskytovatel', 'text'],
  ['name', 'Předplatné', 'text'],
  ['seatEur', '€/uživatel/měs.'],
];

/** Otevře dialog nad kopií cen; onSave(prices) dostane upravenou kopii, onReset() obnoví výchozí. */
export function openSettings(dialog, prices, { onSave, onReset }) {
  const draft = structuredClone(prices);
  dialog.innerHTML = `
    <form method="dialog" class="settings">
      <header>
        <h2>Nastavení cen</h2>
        <p class="muted">Výchozí ceny k ${new Date(PRICES_AS_OF).toLocaleDateString('cs-CZ')}.
          Úpravy se ukládají jen v tomto prohlížeči.</p>
      </header>
      <section><h3>Obecné</h3><div class="grid-general">${GENERAL.map(generalField).join('')}</div></section>
      <section><h3>Stroje</h3>${table(MACHINE_COLS, draft.machines, 'machines')}</section>
      <section><h3>Modely API</h3>${table(MODEL_COLS, draft.models, 'models')}</section>
      <section><h3>Předplatné</h3>${table(PLAN_COLS, draft.plans, 'plans')}</section>
      <footer>
        <button type="button" data-act="reset" class="ghost">Obnovit výchozí</button>
        <span class="spacer"></span>
        <button type="button" data-act="cancel" class="ghost">Zrušit</button>
        <button type="submit" data-act="save">Uložit</button>
      </footer>
    </form>`;

  for (const [key] of GENERAL) dialog.querySelector(`[name="s.${key}"]`).value = draft.settings[key];

  dialog.querySelector('form').addEventListener('input', (e) => {
    const [scope, idx, key] = e.target.name.split('.');
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    if (scope === 's') draft.settings[idx] = value;
    else draft[scope][Number(idx)][key] = value;
  });
  dialog.querySelector('[data-act="cancel"]').onclick = () => dialog.close();
  dialog.querySelector('[data-act="reset"]').onclick = () => {
    onReset();
    dialog.close();
  };
  dialog.querySelector('form').onsubmit = () => onSave(draft);
  dialog.showModal();
}

function generalField([key, label, unit]) {
  return `<label><span>${label}</span><span class="with-unit">
    <input type="number" step="any" min="0" name="s.${key}" required><em>${unit}</em></span></label>`;
}

function table(cols, rows, scope) {
  const head = cols.map(([, label]) => `<th>${label}</th>`).join('');
  const body = rows
    .map((row, i) => `<tr>${cols.map(([key, , type]) => cell(scope, i, key, row[key], type)).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table class="edit"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function cell(scope, i, key, value, type = 'number') {
  const attrs = type === 'number' ? 'type="number" step="any" min="0"' : 'type="text"';
  return `<td><input ${attrs} name="${scope}.${i}.${key}" value="${escapeAttr(value)}" required></td>`;
}

function escapeAttr(v) {
  return String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
