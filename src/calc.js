// Čisté výpočty: žádný DOM, vše v CZK. Spotřeba v milionech tokenů za měsíc.
//
// Zátěž (load) = { inM, outM, inTok, outTok, peak }: měsíční objem, velikost jednoho
// dotazu a špička = kolikrát je zátěž v nejrušnější hodině vyšší než průměr za měsíc.

export const HOURS_PER_MONTH = 730;
const SECONDS_PER_MONTH = HOURS_PER_MONTH * 3600;

/** Měsíční objem z počtu zaměstnanců: dotazů/os./den × pracovní dny × velikost dotazu. */
export function volumeFromUsers(u) {
  const requests = u.employees * u.queries * u.daysMonth;
  return { inM: (requests * u.inTok) / 1e6, outM: (requests * u.outTok) / 1e6 };
}

/** Měsíční platba za API v CZK. priceFactor modeluje pokles cen v čase. */
export function apiMonthlyCzk(inM, outM, model, s, priceFactor = 1) {
  const cache = s.cacheSharePct / 100;
  const eur = inM * (1 - cache) * model.in + inM * cache * model.cached + outM * model.out;
  return eur * priceFactor * s.eurCzk;
}

/**
 * Měsíční platba dnešnímu poskytovateli v CZK: předplatné (offer.seatEur) za každého
 * zaměstnance bez ohledu na spotřebu a bez poklesu cen, jinak za tokeny.
 */
export function providerMonthlyCzk(load, offer, s, priceFactor = 1) {
  if (offer.seatEur != null) return load.employees * offer.seatEur * s.eurCzk;
  return apiMonthlyCzk(load.inM, load.outM, offer, s, priceFactor);
}

/** Strojové sekundy, které měsíční objem zabere na jednom kusu (prefill + decode). */
export function workSeconds(inM, outM, machine) {
  return (inM * 1e6) / machine.prefillTps + (outM * 1e6) / machine.decodeTps;
}

/** Průměrné vytížení přes celý měsíc — určuje spotřebu elektřiny. */
export function avgUtil(inM, outM, machine, units) {
  return workSeconds(inM, outM, machine) / SECONDS_PER_MONTH / units;
}

/**
 * Špička (průměr × peak) na `units` kusech.
 * rho: vytížení kusu; latency: odezva na dotaz (processor sharing: bez zátěže
 * `base`, se zátěží base / (1 − rho)); concurrency: souběžné dotazy na kus (Little).
 */
export function peakLoad(load, machine, units) {
  const active = SECONDS_PER_MONTH / Math.max(1, load.peak);
  const rho = workSeconds(load.inM, load.outM, machine) / active / units;
  const requests = load.inTok > 0 ? (load.inM * 1e6) / load.inTok : 0;
  const lambda = requests / active / units;
  const base = load.inTok / machine.prefillTps + load.outTok / machine.streamTps;
  const latency = rho < 1 ? base / (1 - rho) : Infinity;
  return { rho, lambda, base, latency, concurrency: lambda * latency };
}

/**
 * Kolik kusů je potřeba, aby špička nepřekročila max. vytížení a souběh se vešel
 * do paměti (maxConcurrent na kus). feasible = vejde se do maxUnits stroje.
 */
export function sizing(load, machine, s) {
  const maxRho = s.maxUtilPct / 100;
  const byThroughput = Math.max(1, Math.ceil(peakLoad(load, machine, 1).rho / maxRho));
  let units = byThroughput;
  let peak = peakLoad(load, machine, units);
  // Víc kusů = menší zátěž i kratší odezva na kus, takže souběh s počtem kusů klesá.
  while (peak.concurrency > machine.maxConcurrent && units < 100000) {
    units++;
    peak = peakLoad(load, machine, units);
  }
  return {
    units,
    feasible: units <= machine.maxUnits,
    limitedBy: units > byThroughput ? 'concurrency' : 'throughput',
    ...peak,
  };
}

/** Měsíční provozní náklady HW v CZK; util je průměrné vytížení jednoho kusu (0–1). */
export function hwOpexCzk(units, util, machine, s, capexCzk) {
  const idle = s.idleSharePct / 100;
  const avgKw = units * machine.kw * (idle + (1 - idle) * Math.min(util, 1));
  const energy = avgKw * HOURS_PER_MONTH * s.pue * s.electricityCzkKwh;
  const ops = machine.fte * s.fteCzkMonth;
  const maintenance = (capexCzk * machine.maintenancePct) / 100 / 12;
  const housing = units * machine.housingCzk;
  return { energy, ops, maintenance, housing, total: energy + ops + maintenance + housing };
}

/**
 * Měsíc po měsíci: kumulativní náklady API vs. vlastní HW.
 * Řádek 0 je nákup; když spotřeba přeroste kapacitu, přikoupí se další kus.
 * Jakmile by bylo potřeba víc než maxUnits kusů, HW křivka končí (hwCum = null).
 */
export function simulate(usage, machine, model, s) {
  const unitPriceCzk = machine.priceEur * s.eurCzk;
  const growth = 1 + usage.growthPct / 100;
  const decline = 1 - s.apiDeclinePctYear / 100;
  const loadAt = (m) => ({ ...usage, inM: usage.inM * growth ** (m - 1), outM: usage.outM * growth ** (m - 1) });

  const start = sizing(loadAt(1), machine, s);
  let units = start.units;
  let capexTotal = start.feasible ? units * unitPriceCzk : null;
  let infeasibleFrom = start.feasible ? null : 1;
  const rows = [{ month: 0, api: 0, apiCum: 0, capex: capexTotal, opex: 0, hwCum: capexTotal, units }];

  for (let m = 1; m <= s.horizonMonths; m++) {
    const load = loadAt(m);
    const api = providerMonthlyCzk(load, model, s, decline ** ((m - 1) / 12));
    const prev = rows[m - 1];
    const row = { month: m, inM: load.inM, outM: load.outM, api, apiCum: prev.apiCum + api };

    const need = sizing(load, machine, s);
    if (infeasibleFrom == null && !need.feasible) infeasibleFrom = m;
    if (infeasibleFrom != null) {
      rows.push({ ...row, capex: 0, opex: null, hwCum: null, units: need.units, ...need });
      continue;
    }

    const capex = need.units > units ? (need.units - units) * unitPriceCzk : 0;
    units = Math.max(units, need.units);
    capexTotal += capex;
    const util = avgUtil(load.inM, load.outM, machine, units);
    const opex = hwOpexCzk(units, util, machine, s, capexTotal).total;
    rows.push({ ...row, capex, opex, hwCum: prev.hwCum + capex + opex, units, util, ...peakLoad(load, machine, units) });
  }

  const last = rows[rows.length - 1];
  return {
    rows,
    start,
    feasible: start.feasible,
    infeasibleFrom,
    paybackMonth: paybackMonth(rows),
    savings: infeasibleFrom == null ? last.apiCum - last.hwCum : null,
    finalUnits: infeasibleFrom == null ? last.units : rows[infeasibleFrom - 1].units,
    firstMonth: rows[1],
  };
}

/** První okamžik, kdy kumulativní HW klesne pod API (lineárně interpolováno), jinak null. */
export function paybackMonth(rows) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].hwCum == null || rows[i - 1].hwCum == null) return null;
    const d1 = rows[i].hwCum - rows[i].apiCum;
    if (d1 <= 0) {
      const d0 = rows[i - 1].hwCum - rows[i - 1].apiCum;
      return i - 1 + d0 / (d0 - d1);
    }
  }
  return null;
}

/**
 * Cena za 1M tokenů v ustáleném stavu (bez růstu a poklesu cen):
 * Předplatné se rozpočítá na zadaný objem (počet zaměstnanců je pevný).
 * HW = pořízení rozpočítané na horizont + provoz, dělené objemem.
 * hw = null, když stroj tenhle objem nezvládne ani s maxUnits kusy.
 */
export function costPerMillion(totalM, inShare, usage, machine, model, s) {
  const inM = totalM * inShare;
  const outM = totalM - inM;
  const api = providerMonthlyCzk({ ...usage, inM, outM }, model, s) / totalM;
  const need = sizing({ ...usage, inM, outM }, machine, s);
  if (!need.feasible) return { hw: null, api, units: need.units };
  const capexCzk = need.units * machine.priceEur * s.eurCzk;
  const util = avgUtil(inM, outM, machine, need.units);
  const hwMonthly = capexCzk / s.horizonMonths + hwOpexCzk(need.units, util, machine, s, capexCzk).total;
  return { hw: hwMonthly / totalM, api, units: need.units };
}
