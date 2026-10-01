# LLM HW kalkulačka

**Demo:** https://llm-hw-calculator.vercel.app/

Kdy se firmě vyplatí vlastní AI hardware místo placení LLM API za tokeny.
Kumulativní náklady API vs. vlastní stroj, bod návratnosti, cena za 1M tokenů
podle objemu a srovnání pěti strojů. Ceny v CZK i EUR, editovatelné v Nastavení.

Statická stránka, vanilla JS bez buildu; Chart.js je přibalený ve `vendor/`.

```sh
npm start   # http://localhost:8080 (python3 -m http.server)
npm test    # node --test, testy výpočtů v src/calc.js
```

| Soubor | Co dělá |
|---|---|
| `src/calc.js` | čisté výpočty: měsíční simulace, kapacita, návratnost, cena za 1M |
| `src/data.js` | výchozí stroje, modely, kurzy a datum cen |
| `src/app.js` | vstupy, dlaždice, srovnání |
| `src/charts.js` | grafy |
| `src/settings.js` | dialog Nastavení cen |

Roadmapa: `.claude/plans/roadmap.md`.
