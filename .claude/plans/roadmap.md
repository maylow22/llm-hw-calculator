# LLM HW kalkulačka — roadmapa

Interní pomůcka (s výhledem na veřejnou kalkulačku): kdy se firmě vyplatí
vlastní AI hardware místo placení LLM API za tokeny.

## Princip výpočtu

- **API křivka** = kumulativní součet měsíčních plateb: tokeny × cena modelu.
  Začíná v nule. S růstem spotřeby se zakřivuje nahoru, s poklesem cen API dolů.
- **HW křivka** = pořizovací cena (skok v měsíci 0) + kumulativní provozní
  náklady (elektřina × PUE, lidé, servis, housing). Když spotřeba přeroste
  kapacitu stroje, přibude další kus → další skok.
- **Průsečík** = bod návratnosti. Rozdíl na konci horizontu = úspora / ztráta.
- **Kapacita** se počítá odděleně pro vstup (prefill) a výstup (decode):
  potřebný čas = vstup / prefill_tps + výstup / decode_tps. RAG je silně
  vstupní, jedno „mixed tok/s“ by ho zkreslilo.
- Interně vše v CZK; ceny API, HW i předplatného uložené v EUR (dolarové
  ceníky přepočtené kurzem ČNB), převod kurzem EUR z nastavení. Zobrazení
  vždy v CZK i EUR.

## Rozhodnutí

| Téma | Volba | Proč |
|---|---|---|
| Stack | vanilla JS, ES moduly, bez buildu | malý stav, čisté funkce; build by nic nepřinesl |
| Grafy | Chart.js 4.4.7 vendorovaný v `vendor/` | tooltipy zdarma; lokální soubor = funguje offline i interně |
| Ceny | editovatelné, schované v dialogu „Nastavení“ | poctivost vs. riziko, že někdo omylem ukáže nesmysl |
| Uložení úprav | localStorage | per-uživatel; sdílení sady cen až přes export JSON (v2) |
| Testy | `node --test` jen na `calc.js` | veškerá logika, která může být špatně, je tam |

## Výchozí data (k 30. 9. 2026, ověřit před veřejným nasazením)

Stroje (cena v EUR přepočtená z USD kurzem 0,8806, propustnost je hrubý odhad
pro referenční model):

| Stroj | Cena | kW | prefill tok/s | decode tok/s | Referenční model |
|---|---|---|---|---|---|
| Mac Studio M5 Ultra 512 GB | ~14 100 (odhad) | 0,3 | 1 500 | 150 | gpt-oss-120b |
| Stanice 1× RTX PRO 6000 | ~17 600 | 0,8 | 15 000 | 1 500 | gpt-oss-120b |
| Server 2× RTX PRO 6000 | ~37 000 | 1,6 | 30 000 | 3 000 | gpt-oss-120b / Qwen3 |
| HGX 8× H200 | ~326 000 | 10 | 150 000 | 15 000 | Qwen3-235B / DeepSeek |
| HGX 8× B200 | ~396 000 | 14 | 300 000 | 30 000 | Qwen3-235B / DeepSeek |

Pozor: RTX PRO 6000 zdražila z 8,5k na 16k USD (2025→2026); 512GB Mac se
dodává od konce října a Apple jeho cenu zatím nezveřejnil (256 GB stojí
$9 499–10 799, počítáno s odhadem ~$16 000). API ceny: Anthropic (vč. Sonnet 5.5),
OpenAI (GPT-6 Luna/Sol/Astra, 5.4 mini), Google (Gemini 3.1 Pro, 3.8 Flash
— zaváděcí cena do 31. 12. 2026, pak dvojnásobek — a 3.5 Flash-Lite).
Předplatné v EUR bez DPH při roční fakturaci: Claude Team 20 / Premium 100,
ChatGPT Business 20, Enterprise ~60 (odhad, cena se vyjednává), Gemini 21 / 30.
Že evropské ceníky kopírují dolarové číslo, je neověřený předpoklad.

## Fáze

### v1 — MVP (teď)
1. Repo, `index.html`, layout: tři výběry (spotřeba, stroj, model), dlaždice,
   hlavní graf.
2. `calc.js`: měsíční simulace (růst spotřeby, pokles cen API, přikupování
   kusů), návratnost, úspora, cena za 1M, kapacita/vytížení → testy.
3. Spotřeba: vstupní a výstupní M tokenů/měs., růst %/měs., pomocník
   „uživatelé × dotazy × tokeny“.
4. Dlaždice: návratnost, úspora za horizont, cena za 1M lokálně vs. API,
   vytížení a počet kusů; vše v CZK + EUR.
5. Záložky: kumulativní náklady · cena za 1M podle objemu · srovnání 5 strojů.
6. Nastavení (dialog): kurzy, elektřina, PUE, cena úvazku, max. vytížení,
   horizont, podíl cache, pokles cen API, tabulky strojů a modelů.
7. Datum „ceny k …“ a disclaimer pod grafem.

Hotovo když: testy procházejí, stránka běží přes statický server, výpočet
ručně ověřený na jednom scénáři.

### v1.1 — kapacita (hotovo)
- Špička místo průměru: provozní profil (h/den × dní/měs.) ve vstupech.
  Později nahrazeno přímým násobkem „Špička × průměr“ (viz v1.2).
- Max. počet kusů na stroj → stav „nezvládne“ (dlaždice, srovnání, přerušené křivky).
- Souběh a odezva: Littleův zákon + processor sharing (odezva = base / (1 − ρ)),
  limit souběhu na kus (paměť KV cache) může sám určit počet kusů.
  Nové parametry stroje: streamTps, maxConcurrent, maxUnits.

### v2 — sdílení a důvěra
- Stav v URL (hash) → odkaz na konkrétní výpočet.
- Export / import nastavení cen (JSON) pro sdílení v týmu.
- Mapa návratnosti: stroje × úrovně spotřeby, barevně (≤12 / ≤36 / nikdy).
- Zbytková hodnota HW na konci horizontu (% z ceny).
- Tisk / export do PDF přes print CSS.

### v3 — analýza
- Citlivost (tornádo): které parametry nejvíc hýbou návratností.
- Hybrid: posuvník „x % provozu lokálně, zbytek API“.
- Pronájem GPU v cloudu jako třetí křivka (hodinová sazba × hodiny).
- Více modelů naráz (routing: levný model na klasifikaci, drahý na odpověď).
- Třída modelu (malý / střední / frontier) u API i stroje → varování, když stroj
  srovnatelnou kvalitu neunese.

### v4 — veřejná verze
- Hosting (statický), vlastní doména, analytika bez cookies.
- EN lokalizace, přepínač měny.
- Proces aktualizace cen (datum, zdroje v `data.js`), případně CI kontrola stáří.
- Grafická úprava do firemního brandingu, CTA na kontakt.

## Otevřené otázky
- Kdo a jak často aktualizuje výchozí ceny?
- Veřejná verze: zobrazovat referenční model a upozornění na rozdíl kvality?

### v1.2 — jednodušší zadání spotřeby (hotovo)
- Hlavní vstup = počet zaměstnanců + úroveň spotřeby (Občas / Běžně / Intenzivně / Agenti)
  + růst. Úroveň skrývá dotazy/os./den, velikost dotazu a odpovědi a špičku.
- Podrobnosti (sbalené) jdou doladit; ruční úprava přepne úroveň na „vlastní“.
- Přímé zadání M tokenů/měs. zrušeno — objem se vždy dopočte ze zaměstnanců.
- Špička = editovatelný násobek průměru přes celý měsíc (dřív h/den × dní/měs.);
  pracovní dny zůstaly jen pro výpočet počtu dotazů.
