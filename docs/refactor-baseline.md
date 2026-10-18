# Refactor baseline

This baseline is for the staged refactor tracked in issue #8. It was captured from `main` at `d14e4339a2ba54ef81a4dcca4b0323287ef964f3`.

## Required checks

Run these before and after each extraction:

```sh
npm ci
npm test
npm run test:browser
npm run brain:validate
npm run build
npm run privacy:check
npm audit
```

The browser suite starts a local mocked `/llm` adapter and a fresh Vite server. It clears browser storage for each flow and covers:

- desktop startup and feed activation;
- narrow portrait and short-landscape compact panels;
- agent connect/disconnect;
- consecutive intercom replies;
- a fresh optical inspection;
- the built-in computer;
- session reset and the single undo slot;
- rejection of unexpected external browser requests and page errors.

The browser baseline test prints a `browser-baseline` JSON record with DOMContentLoaded time, load time, resource count, and transferred bytes. Compare measurements only in the same browser/runner environment.

## Baseline results

- Node tests: 104 passing tests across 21 test files.
- Default brain: 693 nodes, 303 pathways, 554 associations; graph id `default-life-1990-v3`.
- Dependency audit: zero reported vulnerabilities.
- Production entry: 1,143.57 kB (344.27 kB gzip).
- Default-brain chunk: 348.40 kB (44.51 kB gzip).
- Creation worker: 745.97 kB.
- Main CSS: 10.85 kB (3.14 kB gzip).

Modularity changes are not performance improvements by themselves. Report size or startup improvements only against comparable measurements.
