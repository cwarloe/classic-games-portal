# 5BX tests

End-to-end tests driving the real app in a phone-sized headless Chromium. No mocks, no unit tests — every assertion goes through the UI the way a person would.

## Running them

```bash
npm install                     # first time
npx playwright install chromium # first time — downloads the browser
npm test                        # all suites
```

`npm test` starts the repo's server on port 8080, runs each suite in its own process, stops the server, and exits non-zero if anything failed.

```bash
npm test -- 04 07               # only suites whose filename starts with 04 or 07
node 5bx/tests/04-integrity.js  # one suite, against a server you started yourself
BASE_URL=https://example.com/5bx/ npm test   # against a deployed copy
PORT=3000 npm test              # if 8080 is taken
CHROMIUM_PATH=/path/to/chrome npm test       # use a specific browser binary
```

## The suites

| | Covers |
|---|---|
| `01-core.js` | Welcome, targets, preview, a full workout, progression, layoff, the metronome, history, offline |
| `02-exercise-5.js` | Stationary run stays primary; substitutions live in Settings; the walk disappears above Chart 4 |
| `03-navigation.js` | The start screen waits for a tap; the tab bar reaches everything; a workout can be left without losing it |
| `04-integrity.js` | The five defects adversarial testing found — wrong level logged, skips not recorded, lost workouts, back button, silent save failures |
| `05-notices.js` | Today shows one notice at a time, in priority order |
| `06-target.js` | The rep count is the largest thing on the workout screen |
| `07-substitution.js` | A substituted exercise 5 describes the substitution everywhere, not the stationary run |
| `08-updates.js` | A new deploy lands on the first relaunch, and never reloads out from under a workout |
| `09-time-bar.js` | The clock lives in a time bar above the controls, and drains with the exercise |

About 190 assertions. Console errors fail a suite even when every assertion passes.

## Probes

`probes/` holds the adversarial scripts that **report** rather than assert — corrupt stored state, racing the UI, hostile input, 800 sessions, a full disk. They never fail; a human reads the output and judges it. They are how the bugs in `04-integrity.js` were found, so they are worth rerunning after any large change.

```bash
node 5bx/tests/probes/state-and-timing.js   # needs a server running
```

## Two things to know

**`08-updates.js` writes to `app.js` and `sw.js`** while it runs — it has to, because it simulates deploying a new version. It restores them on every exit path, including a crash or Ctrl-C, and that restore is itself tested. If a run is ever killed hard enough to skip it, `git checkout 5bx/app.js 5bx/sw.js` puts things back.

**`harness.js` holds everything machine-specific** — the base URL and how to find a browser. A suite never hard-codes a path or a port, so these run the same here and in CI.

## Adding a suite

Name it `NN-topic.js` so the runner finds it and the order is stable. Start from an existing one: require `./harness`, use `launch()` and `phone()`, and exit non-zero on failure. Suites must be independent — the runner gives no ordering guarantees beyond the filename sort, and each one clears `localStorage` itself.
