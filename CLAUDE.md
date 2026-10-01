# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kalkulačka, kdy se firmě vyplatí vlastní AI hardware místo placení LLM API za tokeny.
Kód, komentáře, UI i testy jsou česky — piš stejně.

## Příkazy

```sh
npm start                                                # statický server na http://localhost:8080 (python3 -m http.server)
npm test                                                 # node --test test/*.test.js
node --test --test-name-pattern="špička" test/calc.test.js   # jeden test podle názvu
```

Žádný build, bundler, linter ani npm závislosti. Stránka se musí servírovat přes HTTP
(ES moduly nejdou z `file://`). Chart.js 4.4.7 je vendorovaný v `vendor/` a načítá se
jako globální `Chart` klasickým `<script>` před `src/app.js` — neměnit na CDN
(stránka má fungovat offline/interně).

## Architektura

Vanilla JS, ES moduly, tok dat je jednosměrný: vstupy → `state` v `app.js` → `render()`
přepočítá vše a překreslí dlaždice, varování a aktivní záložku grafu.

- `src/calc.js` — **jediné místo s logikou výpočtu**, čisté funkce bez DOM. Testy
  (`test/calc.test.js`) pokrývají jen tenhle soubor. Klíčové pojmy:
  - vše interně v CZK; ceny API, HW i předplatného jsou v datech v EUR (dolarové ceníky přepočtené
    kurzem) a převádí se `s.eurCzk`; EUR je zároveň zobrazovací měna (`format.js`);
  - objemy jsou v **milionech tokenů za měsíc** (`inM`, `outM`), vstup (prefill)
    a výstup (decode) se počítají zvlášť — nikdy jedno „mixed tok/s“;
  - objem se zadává přes zaměstnance × úroveň spotřeby (`USAGE_LEVELS` v `data.js`,
    doladitelné v „Upravit podrobnosti“), `volumeFromUsers()` z toho dopočte `inM`/`outM`;
  - `sizing()` určuje počet kusů podle špičky (`peak` = kolikrát je nejrušnější hodina
    nad průměrem celého měsíce, ne průměr) a max. vytížení (`maxUtilPct`), plus limit souběhu (`maxConcurrent`,
    odezva přes processor sharing + Littleův zákon);
  - `simulate()` jde měsíc po měsíci, při růstu přikupuje kusy (skoky capex);
    když by bylo potřeba víc než `machine.maxUnits`, HW křivka končí (`hwCum = null`)
    a stroj je „nezvládne“ — UI s `null` počítá, neměň to na 0.
- `src/data.js` — výchozí stroje, modely API, nastavení a `PRICES_AS_OF`. Propustnosti
  strojů jsou hrubé odhady pro referenční model.
- `src/store.js` — úpravy cen v `localStorage` (klíč `llm-hw-calculator.v2`). Při načtení
  se uložené stroje slučují s výchozími podle `id`, takže nové pole stroje v `data.js`
  se starým uživatelům doplní. Modely a nastavení se slučují méně chytře (modely se
  berou celé z uložených).
- `src/settings.js` — dialog Nastavení; editovatelné sloupce jsou v `GENERAL`,
  `MACHINE_COLS`, `MODEL_COLS`. **Nové pole stroje/modelu/nastavení** = přidat do
  `data.js`, sem do sloupců a případně do testovacích fixtur `S`/`MACHINE` v testu.
- `src/app.js` — stav, vazba vstupů, dlaždice (KPI), varování, srovnání strojů.
- `src/charts.js` — kumulativní graf API vs. HW a graf ceny za 1M tokenů podle objemu.
- `src/format.js` — české formátování (`Intl` `cs-CZ`), zkracování „tis./mil./mld.“.

Testy používají fixturu s kurzem 1 a nulovými vedlejšími náklady, aby čísla šla spočítat
z hlavy — nové testy piš stejně.

Principy výpočtu, rozhodnutí a výchozí data s odůvodněním: `.claude/plans/roadmap.md`.
