// Ovládání stránky: vstupy → výpočet → dlaždice, grafy, srovnání.
import { costPerMillion, HOURS_PER_MONTH, simulate, volumeFromUsers } from './calc.js';
import { renderCumulative, renderPerMillion } from './charts.js';
import { PRICES_AS_OF, USAGE_LEVELS } from './data.js';
import { money, months, pct, perMillion, seconds, tokens } from './format.js';
import { openSettings } from './settings.js';
import { initialUsage, loadPrices, resetPrices, savePrices } from './store.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  prices: loadPrices(),
  usage: initialUsage(),
  machineId: 'rtx-1',
  modelId: 'claude-sonnet-5',
  planId: 'claude-team',
  billing: 'tokens', // 'tokens' = API za tokeny, 'seats' = předplatné na zaměstnance
  cur: 'CZK',
  tab: 'cum',
};

const DETAILS = ['queries', 'inTok', 'outTok', 'daysMonth', 'peak'];

// Zátěž pro výpočet: zadání spotřeby + měsíční objem dopočtený ze zaměstnanců.
const load = () => ({ ...state.usage, ...volumeFromUsers(state.usage) });

const other = (cur) => (cur === 'CZK' ? 'EUR' : 'CZK');

// V režimu předplatného je „model“ tarif s cenou za uživatele (seatUsd).
const offers = () => (state.billing === 'seats' ? state.prices.plans : state.prices.models);
const seats = () => state.billing === 'seats';

function current() {
  const { machines, settings } = state.prices;
  const machine = machines.find((m) => m.id === state.machineId) ?? machines[0];
  const id = seats() ? state.planId : state.modelId;
  const model = offers().find((m) => m.id === id) ?? offers()[0];
  return { machine, model, s: settings };
}

// ---------- vstupy ----------

function fillSelects() {
  const { machines } = state.prices;
  const models = offers();
  $('#machine').innerHTML = machines.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  const providers = [...new Set(models.map((m) => m.provider))];
  $('#model').innerHTML = providers
    .map((p) => `<optgroup label="${p}">${models
      .filter((m) => m.provider === p)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('')}</optgroup>`)
    .join('');
  $('#machine').value = current().machine.id;
  $('#model').value = current().model.id;
}

function bindInputs() {
  for (const key of ['employees', 'growthPct', ...DETAILS]) {
    const el = $(`#${key}`);
    el.value = state.usage[key];
    el.addEventListener('input', () => {
      state.usage[key] = Math.max(0, Number(el.value) || 0);
      // ruční úprava podrobností = vlastní úroveň
      if (DETAILS.includes(key)) state.usage.level = null;
      render();
    });
  }
  $('#levels').innerHTML = USAGE_LEVELS.map(
    (l) => `<button type="button" data-level="${l.id}" title="${l.hint}">${l.name}</button>`,
  ).join('');
  for (const btn of document.querySelectorAll('[data-level]')) {
    btn.addEventListener('click', () => {
      const { id, queries, inTok, outTok, peak } = USAGE_LEVELS.find((l) => l.id === btn.dataset.level);
      Object.assign(state.usage, { level: id, queries, inTok, outTok, peak });
      for (const key of DETAILS) $(`#${key}`).value = state.usage[key];
      render();
    });
  }
  $('#machine').addEventListener('change', (e) => {
    state.machineId = e.target.value;
    render();
  });
  $('#model').addEventListener('change', (e) => {
    state[seats() ? 'planId' : 'modelId'] = e.target.value;
    render();
  });
  for (const btn of document.querySelectorAll('[data-billing]')) {
    btn.addEventListener('click', () => {
      state.billing = btn.dataset.billing;
      fillSelects();
      render();
    });
  }
  for (const btn of document.querySelectorAll('[data-cur]')) {
    btn.addEventListener('click', () => {
      state.cur = btn.dataset.cur;
      render();
    });
  }
  for (const btn of document.querySelectorAll('[role="tab"]')) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  }
  $('#open-settings').addEventListener('click', () =>
    openSettings($('#settings'), state.prices, {
      onSave: (prices) => {
        state.prices = prices;
        savePrices(prices);
        fillSelects();
        render();
      },
      onReset: () => {
        state.prices = resetPrices();
        fillSelects();
        render();
      },
    }),
  );
}

// ---------- výstupy ----------

function render() {
  const { machine, model, s } = current();
  const usage = load();
  const sim = simulate(usage, machine, model, s);
  const total = usage.inM + usage.outM;
  const inShare = total > 0 ? usage.inM / total : 1;
  const unit = costPerMillion(total || 1, inShare, usage, machine, model, s);

  renderUsage(usage);
  renderSpecs(machine, model, s, usage);
  renderKpis(sim, unit, total, machine, s);
  renderWarnings(sim, machine, total);
  renderTabs();

  const ctx = { cur: state.cur, s, machineName: machine.name, apiName: `${seats() ? 'Předplatné' : 'API'} · ${model.name}` };
  if (state.tab === 'cum') renderCumulative($('#c-cum'), sim, ctx);
  if (state.tab === 'per1m') renderPerMillion($('#c-per1m'), usage, machine, model, ctx);
  if (state.tab === 'compare') renderCompare(usage, model, s);

  for (const btn of document.querySelectorAll('[data-cur]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.cur === state.cur));
  }
  for (const btn of document.querySelectorAll('[data-billing]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.billing === state.billing));
  }
}

function renderUsage(usage) {
  for (const btn of document.querySelectorAll('[data-level]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.level === usage.level));
  }
  const level = USAGE_LEVELS.find((l) => l.id === usage.level);
  const perDay = usage.employees * usage.queries;
  $('#usage-summary').textContent =
    `${level ? level.hint : 'vlastní nastavení'} · ≈ ${tokens(usage.inM)} vstupních + ${tokens(usage.outM)} výstupních ` +
    `tokenů/měs. · ${Math.round(perDay).toLocaleString('cs-CZ')} dotazů/den · ` +
    `špička ${String(usage.peak).replace('.', ',')}× průměru`;
}

function renderSpecs(machine, model, s, usage) {
  const peakSeconds = (HOURS_PER_MONTH * 3600) / Math.max(1, usage.peak);
  const capacityInM = (machine.prefillTps * peakSeconds * (s.maxUtilPct / 100)) / 1e6;
  const price = machine.priceUsd * s.usdCzk;
  $('#machine-spec').textContent =
    `${money(price, state.cur, s)} (${money(price, other(state.cur), s)}) · ` +
    `kus zvládne ~${tokens(capacityInM)} vstupních tokenů/měs. při zadané špičce, max. ${machine.maxUnits} ks · ` +
    `referenční model ${machine.refModel}`;
  $('#model-spec').textContent = seats()
    ? `$${model.seatUsd} za uživatele/měs. × ${usage.employees.toLocaleString('cs-CZ')} zaměstnanců, ` +
      'nezávisle na spotřebě · tarify mají limity použití, agenty a velké objemy nemusí pokrýt'
    : `$${model.in} vstup · $${model.cached} cache · $${model.out} výstup za 1M tokenů`;
}

function kpi(label, value, sub, tone = '') {
  return `<div class="kpi ${tone}"><div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function renderKpis(sim, unit, total, machine, s) {
  const cur = state.cur;
  const alt = other(cur);
  const h = s.horizonMonths;
  const first = sim.firstMonth;
  const both = (czk) => [money(czk, cur, s), money(czk, alt, s)];
  const [apiMain, apiAlt] = both(first.api);

  const tiles = [];
  if (!sim.feasible) {
    tiles.push(kpi('Návratnost', 'nezvládne', `potřeba ${sim.start.units} ks, max. ${machine.maxUnits}`, 'bad'));
    tiles.push(kpi(`Úspora za ${h} měs.`, '—', 'stroj spotřebu nepokryje', 'bad'));
  } else {
    tiles.push(
      kpi(
        'Návratnost',
        sim.paybackMonth == null ? `nad ${h} měs.` : months(sim.paybackMonth),
        sim.paybackMonth == null ? 'v horizontu se nezaplatí' : 'od nákupu HW',
        sim.paybackMonth == null ? 'bad' : sim.paybackMonth <= 18 ? 'good' : 'warn',
      ),
    );
    if (sim.savings == null) {
      tiles.push(kpi(`Úspora za ${h} měs.`, '—', `od ${sim.infeasibleFrom}. měsíce stroj nestačí`, 'warn'));
    } else {
      const [savMain, savAlt] = both(sim.savings);
      tiles.push(
        kpi(
          `${sim.savings >= 0 ? 'Úspora' : 'Ztráta'} za ${h} měs.`,
          savMain.replace('-', '−'),
          savAlt.replace('-', '−'),
          sim.savings >= 0 ? 'good' : 'bad',
        ),
      );
    }
  }
  tiles.push(kpi(seats() ? 'Předplatné měsíčně' : 'API měsíčně', apiMain, `${apiAlt} · ${tokens(total)} tokenů`));
  if (sim.feasible) {
    const [hwMain, hwAlt] = both(first.opex);
    tiles.push(kpi('Provoz HW měsíčně', hwMain, `${hwAlt} · bez pořízení`));
  } else {
    tiles.push(kpi('Provoz HW měsíčně', '—', 'stroj spotřebu nepokryje'));
  }
  tiles.push(
    kpi(
      'Cena za 1M tokenů',
      unit.hw == null ? '—' : `${perMillion(unit.hw, cur, s)} <small>HW</small>`,
      `API ${perMillion(unit.api, cur, s)} · HW vč. pořízení/${h} měs.`,
      unit.hw != null && unit.hw <= unit.api ? 'good' : '',
    ),
  );
  tiles.push(
    kpi(
      'Vytížení ve špičce',
      pct(first.rho),
      first.util == null ? `při ${first.units} ks` : `${first.units} ks · průměr za měsíc ${pct(first.util)}`,
      first.rho > s.maxUtilPct / 100 ? 'bad' : '',
    ),
  );
  tiles.push(
    kpi(
      'Odezva ve špičce',
      seconds(first.latency),
      `bez zátěže ${seconds(first.base)} · ${first.concurrency.toFixed(1).replace('.', ',')} souběžně / ${machine.maxConcurrent} na ks`,
      first.latency > 2 * first.base ? 'warn' : '',
    ),
  );
  $('#kpis').innerHTML = tiles.join('');
}

function renderWarnings(sim, machine, total) {
  const w = [];
  const first = sim.firstMonth;
  if (!sim.feasible) {
    w.push(
      `${machine.name} tuhle spotřebu nezvládne: ve špičce by bylo potřeba ${sim.start.units} kusů, ` +
        `rozumné maximum je ${machine.maxUnits}. Zkus větší stroj.`,
    );
  } else {
    if (first.units > 1) {
      const why = sim.start.limitedBy === 'concurrency'
        ? 'omezuje paměť pro souběžné dotazy'
        : 'omezuje výkon ve špičce';
      w.push(`Jeden kus nestačí — počítáno s ${first.units} kusy (${why}).`);
    }
    const bought = sim.rows.find((r) => r.month > 0 && r.capex > 0)?.month;
    if (bought) w.push(`Při růstu spotřeby se v ${bought}. měsíci dokupuje další kus — v grafu je to skok.`);
    if (sim.infeasibleFrom) {
      w.push(`Od ${sim.infeasibleFrom}. měsíce spotřeba přeroste limit ${machine.maxUnits} ks — dál HW křivka končí.`);
    }
    if (first.rho > 0 && first.rho < 0.05) {
      w.push(`Stroj je ve špičce vytížený jen na ${pct(first.rho)} — pro tuhle spotřebu je zbytečně velký.`);
    }
  }
  if (total === 0) w.push('Zadej počet zaměstnanců a spotřebu.');
  $('#warnings').innerHTML = w.map((t) => `<li>${t}</li>`).join('');
  $('#warnings').hidden = w.length === 0;
}

function renderTabs() {
  for (const btn of document.querySelectorAll('[role="tab"]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === state.tab));
  }
  for (const panel of document.querySelectorAll('[role="tabpanel"]')) {
    panel.hidden = panel.dataset.tab !== state.tab;
  }
}

function renderCompare(usage, model, s) {
  const cur = state.cur;
  const total = usage.inM + usage.outM;
  const inShare = total > 0 ? usage.inM / total : 1;
  const rows = state.prices.machines.map((m) => ({
    m,
    sim: simulate(usage, m, model, s),
    unit: costPerMillion(total || 1, inShare, usage, m, model, s),
  }));
  const best = Math.max(...rows.map((r) => r.sim.savings ?? -Infinity));
  const api = rows[0].unit.api;

  const row = ({ m, sim, unit }) => {
    const cls = [
      m.id === state.machineId ? 'selected' : '',
      sim.savings === best && best > 0 ? 'best' : '',
      sim.feasible ? '' : 'infeasible',
    ].join(' ');
    const first = sim.firstMonth;
    if (!sim.feasible) {
      return `<tr data-id="${m.id}" class="${cls}"><td>${m.name}</td><td>—</td>
        <td>${sim.start.units} / max. ${m.maxUnits}</td><td>—</td><td>—</td>
        <td class="why" colspan="3">nezvládne: potřeba ${sim.start.units} ks</td></tr>`;
    }
    const savings = sim.savings == null
      ? `<td class="why">od ${sim.infeasibleFrom}. měs. nestačí</td>`
      : `<td class="${sim.savings >= 0 ? 'pos' : 'neg'}">${money(sim.savings, cur, s).replace('-', '−')}</td>`;
    return `<tr data-id="${m.id}" class="${cls}">
      <td>${m.name}</td>
      <td>${money(m.priceUsd * s.usdCzk * sim.finalUnits, cur, s)}</td>
      <td>${sim.finalUnits}</td>
      <td>${pct(first.rho)}</td>
      <td>${seconds(first.latency)}</td>
      <td>${sim.paybackMonth == null ? '—' : months(sim.paybackMonth)}</td>
      ${savings}
      <td>${unit.hw == null ? '—' : perMillion(unit.hw, cur, s)}</td></tr>`;
  };

  $('#compare').innerHTML = `
    <caption>API ${model.name}: ${perMillion(api, cur, s)} za 1M tokenů ·
      ${money(rows[0].sim.rows.at(-1).apiCum, cur, s)} za ${s.horizonMonths} měs.</caption>
    <thead><tr><th>Stroj</th><th>Pořízení</th><th>Kusů</th><th>Špička</th><th>Odezva</th>
      <th>Návratnost</th><th>Úspora za ${s.horizonMonths} měs.</th><th>HW za 1M</th></tr></thead>
    <tbody>${rows.map(row).join('')}</tbody>`;
  for (const tr of document.querySelectorAll('#compare tbody tr')) {
    tr.addEventListener('click', () => {
      state.machineId = tr.dataset.id;
      $('#machine').value = tr.dataset.id;
      render();
    });
  }
}

$('#as-of').textContent = new Date(PRICES_AS_OF).toLocaleDateString('cs-CZ');
fillSelects();
bindInputs();
render();
