import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  apiMonthlyCzk,
  avgUtil,
  costPerMillion,
  hwOpexCzk,
  peakLoad,
  simulate,
  sizing,
  volumeFromUsers,
} from '../src/calc.js';

// Kurz 1 a nulové vedlejší náklady → čísla se dají spočítat z hlavy.
const S = {
  usdCzk: 1,
  eurCzk: 1,
  electricityCzkKwh: 0,
  pue: 1,
  fteCzkMonth: 0,
  maxUtilPct: 100,
  idleSharePct: 0,
  horizonMonths: 36,
  cacheSharePct: 0,
  apiDeclinePctYear: 0,
};
const MODEL = { in: 1, cached: 0.1, out: 10 };
// 1 000 tok/s prefill i decode → 2 628 M tokenů za měsíc na kus; limity souběhu a kusů
// nastavené tak, aby nepřekážely, pokud je test sám nezkoumá.
const MACHINE = {
  priceUsd: 1200,
  kw: 0,
  prefillTps: 1000,
  decodeTps: 1000,
  streamTps: 100,
  maxConcurrent: 1e9,
  maxUnits: 1000,
  fte: 0,
  maintenancePct: 0,
  housingCzk: 0,
};
const MONTH_M = 2628;
// Špička 1× → zátěž rozložená přes celý měsíc.
const FLAT = { inTok: 1000, outTok: 100, peak: 1 };
const usage = (inM, outM = 0, growthPct = 0) => ({ ...FLAT, inM, outM, growthPct });

test('API platba počítá vstup, cache a výstup zvlášť', () => {
  assert.equal(apiMonthlyCzk(100, 10, MODEL, S), 100 + 100);
  assert.equal(apiMonthlyCzk(100, 0, MODEL, { ...S, cacheSharePct: 50 }), 50 + 5);
  assert.equal(apiMonthlyCzk(100, 0, MODEL, { ...S, usdCzk: 20 }, 0.5), 1000);
});

test('průměrné vytížení podle prefill a decode', () => {
  assert.equal(avgUtil(MONTH_M, 0, MACHINE, 1), 1);
  assert.equal(avgUtil(MONTH_M / 2, MONTH_M / 2, MACHINE, 1), 1);
  assert.equal(avgUtil(MONTH_M, 0, MACHINE, 2), 0.5);
});

test('objem ze zaměstnanců: dotazy × dny × velikost dotazu', () => {
  const v = volumeFromUsers({ employees: 100, queries: 10, daysMonth: 20, inTok: 1000, outTok: 100 });
  assert.equal(v.inM, 20); // 20 000 dotazů × 1 000 tokenů
  assert.equal(v.outM, 2);
});

test('špička 4× zvedne vytížení 4×', () => {
  const load = { ...usage(MONTH_M * 0.1), peak: 4 };
  const p = peakLoad(load, MACHINE, 1);
  assert.ok(Math.abs(p.rho - 0.4) < 1e-9);
  // objem, který v průměru vytíží stroj na 40 %, ve 4× špičce potřebuje 2 kusy
  assert.equal(sizing({ ...load, inM: MONTH_M * 0.4 }, MACHINE, { ...S, maxUtilPct: 100 }).units, 2);
});

test('odezva: bez zátěže je base, se zátěží roste 1/(1−ρ); souběh podle Littla', () => {
  const idle = peakLoad(usage(0), MACHINE, 1);
  assert.equal(idle.base, 1000 / 1000 + 100 / 100); // prefill 1 s + decode 1 s
  assert.equal(idle.latency, 2);

  const half = peakLoad(usage(MONTH_M / 2), MACHINE, 1);
  assert.ok(Math.abs(half.rho - 0.5) < 1e-9);
  assert.ok(Math.abs(half.latency - 4) < 1e-9);
  // λ = 1,314e9 tokenů / 1000 na dotaz / 2 628 000 s = 0,5 dotazu/s → souběh 0,5 × 4 = 2
  assert.ok(Math.abs(half.concurrency - 2) < 1e-9);
});

test('sizing: počet kusů určí výkon, nebo souběh (paměť)', () => {
  const s = { ...S, maxUtilPct: 70 };
  const byThroughput = sizing(usage(MONTH_M), MACHINE, s);
  assert.equal(byThroughput.units, 2);
  assert.equal(byThroughput.limitedBy, 'throughput');

  const byMemory = sizing(usage(MONTH_M / 2), { ...MACHINE, maxConcurrent: 1 }, s);
  assert.equal(byMemory.limitedBy, 'concurrency');
  assert.ok(byMemory.units > 1);
  assert.ok(byMemory.concurrency <= 1);
});

test('stroj, který potřebuje víc než maxUnits kusů, spotřebu nezvládne', () => {
  const machine = { ...MACHINE, maxUnits: 2 };
  const need = sizing(usage(MONTH_M * 5), machine, { ...S, maxUtilPct: 70 });
  assert.equal(need.feasible, false);
  assert.equal(need.units, 8); // ⌈5 / 0,7⌉

  const r = simulate(usage(MONTH_M * 5), machine, MODEL, S);
  assert.equal(r.feasible, false);
  assert.equal(r.infeasibleFrom, 1);
  assert.equal(r.paybackMonth, null);
  assert.equal(r.savings, null);
  assert.equal(r.rows[5].hwCum, null);
  assert.ok(r.rows[5].apiCum > 0);
});

test('provoz: elektřina s podílem naprázdno, úvazek, servis, housing', () => {
  const machine = { ...MACHINE, kw: 1, fte: 0.5, maintenancePct: 12, housingCzk: 100 };
  const s = { ...S, electricityCzkKwh: 2, idleSharePct: 50, fteCzkMonth: 1000 };
  const o = hwOpexCzk(2, 0, machine, s, 1000);
  assert.equal(o.energy, 2 * 0.5 * 730 * 2);
  assert.equal(o.ops, 500);
  assert.equal(o.maintenance, 10);
  assert.equal(o.housing, 200);
});

test('návratnost: pořízení 1 200 při úspoře 100 měsíčně = 12 měsíců', () => {
  const r = simulate(usage(100), MACHINE, MODEL, S);
  assert.equal(r.paybackMonth, 12);
  assert.equal(r.savings, 36 * 100 - 1200);
});

test('když se HW nezaplatí v horizontu, návratnost je null', () => {
  const r = simulate(usage(10), MACHINE, MODEL, S);
  assert.equal(r.paybackMonth, null);
  assert.ok(r.savings < 0);
});

test('růst spotřeby přikoupí další kus v měsíci, kdy dojde kapacita', () => {
  const r = simulate(usage(MONTH_M * 0.9, 0, 5), MACHINE, MODEL, S);
  assert.equal(r.rows[0].units, 1);
  assert.equal(r.rows[3].units, 1); // 0,9 × 1,05² ≈ 0,99
  assert.equal(r.rows[4].units, 2); // 0,9 × 1,05³ ≈ 1,04
  assert.equal(r.rows[4].capex, 1200);
});

test('růst přes maxUnits: HW křivka od toho měsíce končí', () => {
  const r = simulate(usage(MONTH_M * 0.9, 0, 5), { ...MACHINE, maxUnits: 1 }, MODEL, S);
  assert.equal(r.feasible, true);
  assert.equal(r.infeasibleFrom, 4);
  assert.notEqual(r.rows[3].hwCum, null);
  assert.equal(r.rows[4].hwCum, null);
  assert.equal(r.savings, null);
});

test('pokles cen API zlevňuje pozdější měsíce', () => {
  const r = simulate(usage(100), MACHINE, MODEL, { ...S, apiDeclinePctYear: 50 });
  assert.equal(r.rows[1].api, 100);
  assert.ok(Math.abs(r.rows[13].api - 50) < 1e-9);
});

test('cena za 1M: HW klesá s objemem, API je konstantní, nad limit kusů null', () => {
  const small = costPerMillion(100, 1, FLAT, MACHINE, MODEL, S);
  const big = costPerMillion(1000, 1, FLAT, MACHINE, MODEL, S);
  assert.equal(small.api, 1);
  assert.equal(big.api, 1);
  assert.equal(small.hw, 1200 / 36 / 100);
  assert.ok(big.hw < small.hw);
  assert.equal(costPerMillion(MONTH_M * 3, 1, FLAT, { ...MACHINE, maxUnits: 2 }, MODEL, S).hw, null);
});
