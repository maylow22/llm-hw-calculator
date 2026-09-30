// Grafy nad Chart.js (vendor/chart.umd.min.js, globální `Chart`).
import { costPerMillion } from './calc.js';
import { money, months, perMillion, SYMBOL, tokens, toCurrency } from './format.js';

const { Chart } = window;

/** Svislá čárkovaná čára s popiskem: options.plugins.vline = { x, label }. */
Chart.register({
  id: 'vline',
  afterDatasetsDraw(chart, _args, opts) {
    if (opts?.x == null) return;
    const { ctx, chartArea, scales } = chart;
    const px = scales.x.getPixelForValue(opts.x);
    if (px < chartArea.left || px > chartArea.right) return;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.fillStyle = opts.color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, chartArea.top);
    ctx.lineTo(px, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 12px system-ui, sans-serif';
    const w = ctx.measureText(opts.label).width;
    const tx = px + 6 + w > chartArea.right ? px - 6 - w : px + 6;
    ctx.fillText(opts.label, tx, chartArea.top + 14);
    ctx.restore();
  },
});

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function baseOptions() {
  const grid = css('--grid');
  const text = css('--muted');
  Chart.defaults.color = text;
  Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxHeight: 6 } } },
    scales: { x: { grid: { color: grid } }, y: { grid: { color: grid } } },
  };
}

let cumulative;
let per1m;

export function renderCumulative(canvas, sim, ctx) {
  const { cur, s, machineName, apiName } = ctx;
  // Data jsou už v cílové měně; formátovače berou CZK, proto `back`.
  const back = (v) => (cur === 'EUR' ? v * s.eurCzk : v);
  const pts = (key) => sim.rows.map((r) => ({ x: r.month, y: r[key] == null ? null : toCurrency(r[key], cur, s) }));

  const opts = baseOptions();
  opts.scales.x.type = 'linear';
  opts.scales.x.title = { display: true, text: 'měsíce' };
  opts.scales.x.max = s.horizonMonths;
  opts.scales.x.ticks = { stepSize: 6 };
  opts.scales.y.beginAtZero = true;
  opts.scales.y.ticks = { callback: (v) => money(back(v), cur, s) };
  opts.plugins.tooltip = {
    callbacks: {
      title: (items) => `${items[0].parsed.x}. měsíc`,
      label: (i) => ` ${i.dataset.label}: ${money(back(i.parsed.y), cur, s)}`,
    },
  };
  opts.plugins.vline = sim.paybackMonth == null
    ? { x: null }
    : { x: sim.paybackMonth, label: `návratnost ${months(sim.paybackMonth)}`, color: css('--good') };

  const data = {
    datasets: [
      line(apiName, pts('apiCum'), css('--api')),
      line(`Vlastní HW · ${machineName}`, pts('hwCum'), css('--hw')),
    ],
  };
  cumulative = upsert(cumulative, canvas, 'line', data, opts);
}

export function renderPerMillion(canvas, usage, machine, model, ctx) {
  const { cur, s } = ctx;
  const totalNow = usage.inM + usage.outM;
  const inShare = totalNow > 0 ? usage.inM / totalNow : 0.95;
  const volumes = logSpace(10, 200000, 80);
  const points = volumes.map((v) => ({ v, ...costPerMillion(v, inShare, usage, machine, model, s) }));
  const conv = (czk) => (czk == null ? null : toCurrency(czk, cur, s));
  const back = (v) => (cur === 'EUR' ? v * s.eurCzk : v);

  const opts = baseOptions();
  opts.interaction = { mode: 'nearest', axis: 'x', intersect: false };
  opts.scales.x.type = 'logarithmic';
  opts.scales.x.title = { display: true, text: 'tokenů za měsíc' };
  opts.scales.x.ticks = { callback: (v) => (isRoundLog(v) ? tokens(v) : '') };
  opts.scales.y.type = 'logarithmic';
  opts.scales.y.title = { display: true, text: `${SYMBOL[cur]} za 1M tokenů` };
  opts.scales.y.ticks = { callback: (v) => (isRoundLog(v) ? perMillion(back(v), cur, s) : '') };
  opts.plugins.tooltip = {
    callbacks: {
      title: (items) => `${tokens(items[0].parsed.x)} tokenů / měs.`,
      label: (i) => ` ${i.dataset.label}: ${perMillion(back(i.parsed.y), cur, s)} / 1M`,
    },
  };
  const cross = points.find((p) => p.hw != null && p.hw <= p.api);
  opts.plugins.vline = cross
    ? { x: cross.v, label: `vyplatí se od ~${tokens(cross.v)} tokenů/měs.`, color: css('--good') }
    : { x: null };

  const data = {
    datasets: [
      line(ctx.apiName, points.map((p) => ({ x: p.v, y: conv(p.api) })), css('--api')),
      line(`Vlastní HW · ${machine.name}`, points.map((p) => ({ x: p.v, y: conv(p.hw) })), css('--hw')),
      {
        label: 'Vaše spotřeba',
        type: 'scatter',
        data: [{ x: totalNow, y: conv(costPerMillion(totalNow || 1, inShare, usage, machine, model, s).hw) }],
        backgroundColor: css('--text'),
        pointRadius: 5,
      },
    ],
  };
  per1m = upsert(per1m, canvas, 'line', data, opts);
}

function line(label, data, color) {
  return { label, data, borderColor: color, backgroundColor: color, borderWidth: 2.5, pointRadius: 0, tension: 0 };
}

function upsert(chart, canvas, type, data, options) {
  if (chart) chart.destroy();
  return new Chart(canvas, { type, data, options });
}

function logSpace(from, to, n) {
  const a = Math.log10(from);
  const b = Math.log10(to);
  return Array.from({ length: n }, (_, i) => 10 ** (a + ((b - a) * i) / (n - 1)));
}

function isRoundLog(v) {
  const e = Math.log10(v);
  return Math.abs(e - Math.round(e)) < 1e-9;
}
