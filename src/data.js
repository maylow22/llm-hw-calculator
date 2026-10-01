// Výchozí data kalkulačky. Ceny API, HW i předplatného jsou v EUR (dolarové ceníky
// přepočtené kurzem ČNB 30. 9. 2026, 1 USD = 0,8806 EUR), provozní náklady v CZK.
// Propustnost strojů je hrubý odhad pro referenční model při dávkovém provozu (vLLM):
// prefillTps/decodeTps = souhrnně za stroj, streamTps = rychlost výstupu pro jednoho
// uživatele, maxConcurrent = souběžné dotazy, které se vejdou do paměti (KV cache)
// při kontextu ~8k, maxUnits = kolik kusů vedle sebe má ještě smysl provozovat.
// Všechno je editovatelné v Nastavení.

export const PRICES_AS_OF = '2026-09-30';

export const DEFAULT_SETTINGS = {
  eurCzk: 24.44, // ČNB 30. 9. 2026
  electricityCzkKwh: 5.0,
  pue: 1.3, // chlazení a ztráty navíc k příkonu stroje
  fteCzkMonth: 130000, // plná cena úvazku MLOps pro firmu
  maxUtilPct: 70, // nad tohle se přikupuje další kus
  idleSharePct: 30, // příkon naprázdno jako % maxima
  horizonMonths: 36, // životnost HW
  cacheSharePct: 30, // podíl vstupu čteného z prompt cache u API
  apiDeclinePctYear: 10, // očekávaný roční pokles cen API
};

export const DEFAULT_MACHINES = [
  {
    id: 'mac-m5-ultra',
    name: 'Mac Studio M5 Ultra 512 GB',
    // Apple cenu 512GB verze zatím nezveřejnil (256 GB stojí $9 499–10 799), odhad ~$16 000
    priceEur: 14100,
    kw: 0.3,
    prefillTps: 1500,
    decodeTps: 150,
    streamTps: 60,
    maxConcurrent: 8,
    maxUnits: 4,
    fte: 0.05,
    maintenancePct: 0,
    housingCzk: 0,
    refModel: 'gpt-oss-120b',
  },
  {
    id: 'rtx-1',
    name: 'Stanice 1× RTX PRO 6000',
    priceEur: 17600,
    kw: 0.8,
    prefillTps: 15000,
    decodeTps: 1500,
    streamTps: 150,
    maxConcurrent: 32,
    maxUnits: 4,
    fte: 0.1,
    maintenancePct: 0,
    housingCzk: 0,
    refModel: 'gpt-oss-120b',
  },
  {
    id: 'rtx-2',
    name: 'Server 2× RTX PRO 6000',
    priceEur: 37000,
    kw: 1.6,
    prefillTps: 30000,
    decodeTps: 3000,
    streamTps: 150,
    maxConcurrent: 96,
    maxUnits: 8,
    fte: 0.2,
    maintenancePct: 5,
    housingCzk: 2000,
    refModel: 'gpt-oss-120b / Qwen3-30B',
  },
  {
    id: 'h200-8',
    name: 'HGX 8× H200',
    priceEur: 326000,
    kw: 10,
    prefillTps: 150000,
    decodeTps: 15000,
    streamTps: 70,
    maxConcurrent: 256,
    maxUnits: 4,
    fte: 0.5,
    maintenancePct: 10,
    housingCzk: 15000,
    refModel: 'Qwen3-235B / DeepSeek',
  },
  {
    id: 'b200-8',
    name: 'HGX 8× B200',
    priceEur: 396000,
    kw: 14,
    prefillTps: 300000,
    decodeTps: 30000,
    streamTps: 100,
    maxConcurrent: 512,
    maxUnits: 4,
    fte: 0.5,
    maintenancePct: 10,
    housingCzk: 20000,
    refModel: 'Qwen3-235B / DeepSeek',
  },
];

// EUR za 1M tokenů: vstup, cachovaný vstup, výstup.
export const DEFAULT_MODELS = [
  { id: 'claude-haiku-4-5', provider: 'Anthropic', name: 'Claude Haiku 4.5', in: 0.881, cached: 0.0881, out: 4.4 },
  { id: 'claude-sonnet-5', provider: 'Anthropic', name: 'Claude Sonnet 5', in: 1.76, cached: 0.176, out: 8.81 },
  { id: 'claude-sonnet-5-5', provider: 'Anthropic', name: 'Claude Sonnet 5.5', in: 1.76, cached: 0.176, out: 8.81 },
  { id: 'claude-opus-5-5', provider: 'Anthropic', name: 'Claude Opus 5.5', in: 3.52, cached: 0.176, out: 17.6 },
  { id: 'claude-fable-5-1', provider: 'Anthropic', name: 'Claude Fable 5.1', in: 8.81, cached: 0.22, out: 44 },
  { id: 'gpt-6-luna', provider: 'OpenAI', name: 'GPT-6 Luna', in: 0.0881, cached: 0.00881, out: 0.44 },
  { id: 'gpt-5-4-mini', provider: 'OpenAI', name: 'GPT-5.4 mini', in: 0.66, cached: 0.066, out: 3.96 },
  { id: 'gpt-6-sol', provider: 'OpenAI', name: 'GPT-6 Sol', in: 1.76, cached: 0.176, out: 8.81 },
  { id: 'gpt-6-astra', provider: 'OpenAI', name: 'GPT-6 Astra', in: 8.81, cached: 0.881, out: 44 },
  { id: 'gemini-3-5-flash-lite', provider: 'Google', name: 'Gemini 3.5 Flash-Lite', in: 0.264, cached: 0.0264, out: 2.2 },
  // do 31. 12. 2026, od 1. 1. 2027 dvojnásobek
  { id: 'gemini-3-8-flash', provider: 'Google', name: 'Gemini 3.8 Flash', in: 0.66, cached: 0.066, out: 3.3 },
  { id: 'gemini-3-1-pro', provider: 'Google', name: 'Gemini 3.1 Pro', in: 1.76, cached: 0.176, out: 10.6 },
];

// Firemní předplatné: EUR za uživatele a měsíc při roční fakturaci, bez DPH (orientačně;
// evropské ceníky obvykle kopírují dolarové číslo). Platí se za každého zaměstnance
// bez ohledu na spotřebu tokenů. ChatGPT Enterprise nemá veřejnou cenu — odhad.
export const DEFAULT_PLANS = [
  { id: 'claude-team', provider: 'Anthropic', name: 'Claude Team', seatEur: 20 },
  { id: 'claude-team-premium', provider: 'Anthropic', name: 'Claude Team Premium', seatEur: 100 },
  { id: 'chatgpt-business', provider: 'OpenAI', name: 'ChatGPT Business', seatEur: 20 },
  { id: 'chatgpt-enterprise', provider: 'OpenAI', name: 'ChatGPT Enterprise', seatEur: 60 },
  { id: 'gemini-enterprise-business', provider: 'Google', name: 'Gemini Business', seatEur: 21 },
  { id: 'gemini-enterprise', provider: 'Google', name: 'Gemini Enterprise', seatEur: 30 },
];

// Úrovně spotřeby na zaměstnance a pracovní den. Špička = kolikrát je zátěž v nejrušnější
// hodině vyšší než průměr přes celý měsíc (730 h): kancelářský provoz 10 h × 22 dní dává
// ~3,3×, ranní nával ho zvedne dál; agenti běží rovnoměrněji.
export const USAGE_LEVELS = [
  { id: 'light', name: 'Občas', hint: 'občasné dotazy do chatu', queries: 5, inTok: 2000, outTok: 300, peak: 6 },
  { id: 'regular', name: 'Běžně', hint: 'asistent a hledání v dokumentech', queries: 20, inTok: 5000, outTok: 400, peak: 5 },
  { id: 'heavy', name: 'Intenzivně', hint: 'práce s dlouhými dokumenty, analýzy', queries: 60, inTok: 10000, outTok: 600, peak: 4 },
  { id: 'agents', name: 'Agenti', hint: 'AI agenti a vývoj s velkým kontextem', queries: 400, inTok: 30000, outTok: 800, peak: 3 },
];

export const DEFAULT_USAGE = {
  employees: 500,
  level: 'regular',
  queries: 20,
  inTok: 5000,
  outTok: 400,
  peak: 5,
  daysMonth: 22,
  growthPct: 0,
};
