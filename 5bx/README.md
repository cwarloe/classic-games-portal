# 5BX

A mobile-first, installable PWA for the RCAF **5BX Plan** (Five Basic Exercises, Dr. Bill Orban, 1961). No build step, no backend, no accounts — everything lives in `localStorage` on the device.

Open `5bx/index.html` over HTTP (the app `fetch`es its data file, so `file://` won't work). The repo's existing `server.js` already serves the directory statically: run `npm start` and visit `/5bx/`.

## Files

| File | What it is |
|---|---|
| `data/5bx-charts.json` | **All plan data.** Rep counts, step counts, run/walk times, exercise descriptions, age goals, progression rules. Hand-editable. |
| `index.html` | Screen markup (welcome, today, preview, picker, workout, log, history, reference, settings). |
| `app.js` | All behaviour. No dependencies. |
| `styles.css` | Dark theme, large tap targets. |
| `figures/` | The booklet's exercise illustrations, `c{chart}e{exercise}.png`. Regenerate with `tools/extract-5bx-figures.py`. |
| `sw.js` | Service worker — offline-first over a fixed asset list. |
| `manifest.webmanifest` | Install metadata. |

## Editing the data

`data/5bx-charts.json` is the single source of truth. Each chart holds a `levels` object keyed by level name:

```json
"D-": { "reps": [2, 3, 4, 2], "steps": 100,
        "runSeconds": 480, "runDisplay": "8",
        "walkSeconds": 1260, "walkDisplay": "21" }
```

- `reps` is always `[exercise1, exercise2, exercise3, exercise4]`.
- `steps` is exercise 5 (the stationary run).
- `runSeconds` / `walkSeconds` drive the timer when exercise 5 is substituted; `runDisplay` / `walkDisplay` are what the UI shows (charts 1–4 print minutes, charts 5–6 print `mins:secs`).
- `levelOrder` at the top of the file is ascending difficulty (`D-` → `A+`) and defines progression; the printed booklet lists levels in the opposite order.

Changing a number takes effect on reload. Bump `CACHE` in `sw.js` to push an edit to a device that already installed the app.

## Provenance of the numbers

Every rep count, step count and time was transcribed from a scan of the original booklet (Information Canada, Ottawa, 1965; reprinted 1968/1970/1973/1975), pages 16–32, read at high resolution. Confidence is high for three reasons:

1. **Chart 3 appears twice in the booklet** (pages 17 and 24) and both printings agree exactly.
2. Every column in every chart is **monotonic** across levels — reps and steps increase as the level rises, run and walk times decrease. A transcription slip would almost certainly break that.
3. Cross-checked against an independent transcription (fit450.com). It agreed everywhere except three cells, each re-verified against the scan at 900 dpi; the booklet was right and the secondary source wrong in all three:
   - Chart 2, level B, steps — booklet **445** (secondary source duplicated 455 from B+)
   - Chart 3, levels C+ and C, run/walk times — booklet **8½ min / 27 min** (secondary source copied the D+ row)
   - Chart 4, level D+, steps — booklet **325** (secondary source had 320)

   The same source also lists 30–34 yrs as Chart 4 `C+` on one page and `C-` on another; the booklet says **C-**. And it repeats "lift feet approximately 4 inches off floor" for exercise 5 on charts 4–6, where the booklet says **"lift knees waist high"**.

## Screens

**Welcome** — first run only, three cards, skippable at any point: what 5BX is, how the levels work, and an optional age that sets your goal. Replayable from Settings. Its only job is to get someone oriented enough to press start.

**Preview** — one tap from Today, beside Start: all five exercises with figures, targets and instructions. Today already lists the exercises and targets; what it cannot show is what the movements look like, and the figures otherwise only appear mid-exercise when it is too late to study them. Start stays primary and full-size, so the happy path for a returning user is still a single tap.

**Start screen** — the branded screen on launch waits for a tap; opening the app should feel like opening an app, not being dropped into a workout. It also appears on *resume*, but only when the app has been in the background 20+ minutes and no workout is running — an installed PWA resuming from background never re-runs boot, so without this you come back to whatever screen you left. A workout in progress is never interrupted. `splashAutoMs` in Advanced restores the old auto-dismissing beat if you'd rather skip the tap.

**Breaks between exercises** — a transition before *every* exercise (not just the first) showing what's next: name, target, figure and a countdown. Tap to start immediately. Default 10s, configurable 0/5/10/15/20 in Settings.

**Today** is the landing screen: your current level, the journey bar, today's targets and one big Start. The chart/level grid lives behind "Change" — for a returning user the answer is almost always "the level I'm on", and putting the picker up front quietly invited level-hopping.

## Navigation

Four screens are places you can *be* — **Today, History, Reference, Settings** — and a tab bar keeps all four reachable from any of them. The focused flows (welcome, level picker, preview, workout, finish) hide the bar, because those are things you finish or back out of rather than places to live. Before this, Today's own topbar and a ghost button row were the only way across, so the app read as a workout screen with some links rather than something you could move around in.

### Leaving a workout without losing it

The pause sheet's fourth option is **Home — keep this workout**. It pauses the run and returns you to Today, where a banner says which exercise you're on and offers **Back to the workout** or **Discard it**; the Start button becomes **Resume workout**. `tick()` already returned early while paused, so nothing accrues on either clock while you're away.

Previously the only exits from a workout were Resume, End and save, and Discard — there was no way to go look something up in the Reference and come back.

A paused workout also survives a reload. `fivebx.run.v1` holds a snapshot — position, both clocks, the skip flag and the workout's own level — written when you pause, change exercise, or every five seconds of exercise time. On boot it comes back **paused**, never running, and a snapshot older than 12 hours is discarded rather than offered as today's workout. Phones evict backgrounded PWAs routinely, so without this the banner was promising something it couldn't keep.

### The back button

Screens other than the roots (splash, welcome, Today) are pushed onto `history`, so Android's back button and the browser's back button back out one screen instead of leaving the app. Backing out of a live workout opens the pause sheet rather than abandoning the run.

### A workout belongs to its own level

`run` is stamped with `chartId`, `level` and `ex5Mode` when it is built, and every read during a workout goes through `run.*` rather than `prefs.*`. Because you can now leave a run paused and change level on Today, reading the *current* selection at the finish meant a Chart 1 D− workout could be logged as Chart 4 A — corrupting history and the progression rule with it.

## Settings, and what is deliberately not settable

Tunable defaults live in `appDefaults` in the data file, not as constants in `app.js`. Settings writes overrides into `localStorage`; **Reset to defaults** clears those and falls back to the file. So everything adjustable is in one hand-editable place.

Everyday controls sit at the top of Settings. **Advanced** (collapsed) holds: metronome cadence floor and ceiling, jump lead-in, the three layoff thresholds, splash timing, and voice speed. Values are clamped to sane ranges on entry.

**Not settable, on purpose:** the 11 minute total and the 2/1/1/1/6 per-exercise allotments. They are the basis of the programme and stay fixed in `timing`.

## Orientation during a workout

The header reads `Chart 3 · D−` over `1 of 5`. Pause (or ✕) opens a **sheet** listing all five exercises with the current one marked "you are here", and three unambiguous exits: **Resume**, **End and save**, **Discard workout**. Previously ✕ was the only way out and meant "abandon", with nothing that let you look around without losing your place.

## New level brief

Moving up inside a chart only raises the counts. Moving to a **new chart** changes the movements themselves, and the app used to say nothing about it until you were mid-set.

Today shows a banner when you arrive at a level you have not looked at (`prefs.levelSeen`), and the Preview screen leads with **what changed** versus the level below:

- same chart — `Toe touching 3 → 4 reps`
- new chart — `Sit-up, hands behind head — was Sit-up · 23 → 20 reps`

Opening the preview acknowledges the level, so the banner appears once.

## Exercise 5 and its substitutions

Exercise 5 is the stationary run, and it stays the default — everything the app adds hangs off it: the metronome, the step count, the jump windows, the pace preview. The booklet offers two alternatives ("if you prefer, you may run or walk the recommended distance in the required time"), and the app offers them as exactly that.

The choice lives in **Settings**, not on the level picker. It sat next to Chart and Level as a third field of equal weight, which read as a decision you were meant to make rather than a substitution you might occasionally want. Each option is now labelled for what it is — *As printed* versus *Substitution* — and the hint says out loud that the metronome, step count and jump prompts go quiet while a substitution is active.

Which alternatives exist is the booklet's own gating, not ours: the run is ½ mile on Chart 1 and 1 mile from Chart 2 up; the walk is offered on Charts 1–4 and disappears from Chart 5. Changing to a chart that doesn't offer your substitution falls back to the stationary run.

The setting is sticky, so Today carries an `Exercise 5: 1 mile run · Undo` chip whenever one is active — otherwise the only signal was a small "substituted" label and the quiet absence of the metronome. Today's footer also stops claiming 11 minutes: a substitution counts its own allotted time (Chart 1 D− with the ½ mile run is 13 minutes), which is longer than 11 by design.

## Two clocks

The booklet gives per-exercise allotments totalling 11 minutes and says **nothing at all about rest between exercises** — while explicitly allowing that the allotted times "may be varied within the total 11 minute period". A pause to get off the floor is therefore an app decision, not a violation, so long as it is accounted for honestly.

Break time sits **outside** the 11 minutes. Two clocks are tracked:

- `exElapsed` — time spent actually exercising. This is the 11:00 the plan's progression rule counts, and it is what the workout header shows.
- `totalElapsed` — wall clock including breaks.

Both are stored on every session (`durationSeconds` and `totalSeconds`). The finish screen shows exercise time prominently and total time beneath it.

Because exercise time is now measured rather than guessed, the finish screen **pre-fills** the "completed within 11 minutes" answer — but only when it can vouch for it. Two guards, because this is the one rule the plan actually turns on:

- **Skipping ahead sets `run.skipped`**, which leaves the answer blank and says so. This includes pressing Next *during a break* — which skips the whole upcoming exercise, and used not to count.
- **A session under half the allotment is never vouched for.** Exercises 1–4 alone run five minutes unless they were cut short, so anything near zero is a walkout, not a fast workout. It reads "far short of a full session" rather than "inside the 11 minute allotment".

Without both, tapping Next through a workout in three seconds logged `durationSeconds: 0, completedInTime: true` and Today immediately offered the next level.

## Voice and the metronome

The spoken announcement plays during the break, and the exercise never starts while it is still talking. Previously `paintStep()` started the metronome in the same frame as the announcement, so the ticking ran underneath the voice.

Two guards: the announcement is structurally moved into the break, and `Voice.say()` takes an `onEnd` callback backed by a word-count timeout (speechSynthesis `end` is unreliable on some platforms). With breaks set to 0 and voice on, the exercise still waits for the announcement to finish — 0 means "no dead air", not "talk over me".

## Progression rule

The booklet's rule is: move up one level only once you can complete *all* the required movements at your present level **within 11 minutes**. It also caps how fast you may climb, by age (1 day per level at 20 or under, up to 10 days per level at 60+).

The app applies both. After you log a session marked "completed within 11 minutes", the home screen suggests the next level — but only once you have logged sessions on at least the required number of distinct days at that level. Set your age on the Reference screen to enable the day requirement; leave it unset and only the 11-minute rule applies. `A+` on one chart advances to `D-` on the next.

## Where you start, and where you're going

Age sets the **goal**, never the starting point. The booklet is blunt about this:

> "Even if you feel able to start at a high level and progress at a faster rate than indicated — DON'T DO IT. Start at the bottom of Chart 1 and work up from level to level as recommended."

So the welcome collects an age, shows the goal it implies, and still starts everyone at Chart 1 D−. Age 38 → Chart 3 level B, which the app reports as 32 levels from the bottom — matching the booklet's own worked example.

The visual hierarchy carries this: **"You start here — Chart 1 · D−"** is the headline on that card (30px, in the accent box) and the age goal is a quiet 14.5px line beneath it. An earlier version had them the other way round, which read as though the app had set you to the goal level — the exact opposite of the rule.

The journey bar on Today shows position across all 72 levels with a marker at the age goal.

## Layoff detection

The booklet: *"Do drop back several levels — until you find one you can do without undue strain. After a period of inactivity of longer than two months, or one month if caused by illness, it is recommended that you start again at Chart 1."*

Today shows a notice when the last logged session is old, and **recommends without imposing** — accept the drop or keep your level, either way it stops asking for that layoff (`layoffAck` in prefs).

| Days since last session | Recommendation |
|---|---|
| under 14 | nothing |
| 14–59 | drop back 3 levels |
| 60+ | restart at Chart 1 D− |

The thresholds and the 3-level drop are an interpretation of "several levels"; the two-month rule is verbatim. Constants are at the top of the layoff section in `app.js`.

## Illustrations

Each exercise shows the original booklet's stick figures under its instructions during a workout, as a form reminder. They are extracted from the scan by `tools/extract-5bx-figures.py` into white silhouettes on transparent backgrounds (about 350 KB for all 30, precached for offline use).

Reclining poses print as very wide, short strips — fine on paper, roughly 15 px tall on a phone. The tool splits those on their whitespace gutters and stacks the poses vertically so each renders at full card width.

To regenerate after changing the extraction, supply your own scan and bump `CACHE` in `sw.js` so installed devices pick up the new images:

```bash
pip install pymupdf pillow numpy
python3 tools/extract-5bx-figures.py path/to/5bx-plan.pdf
```

## Coaching aids (Settings)

Both are **off by default**; the workout is unchanged until you switch them on.

**Voice cues** — speaks the exercise, its target and each jump set. Uses the browser's built-in `speechSynthesis` with an on-device voice, so it needs no network and adds nothing to the download. `Voice.say()` in `app.js` is the only function that touches a speech engine: to move to pre-recorded clips, swap its body for audio playback keyed on the same short phrases and nothing else changes.

iOS will not speak until an utterance comes from a user gesture, so `Voice.unlock()` fires on the "Start workout" tap alongside the WebAudio unlock.

**Step metronome** — paces exercise 5 and counts steps toward the target, and **stops for every jump set** so the jumps are never raced against a running counter. Tap anywhere to resume early; the "wait until I tap" mode never auto-resumes.

Cadence is derived per level rather than fixed, because the targets vary enormously:

| Level | Steps | Jump sets | Pace | Exercise 5 |
|---|---|---|---|---|
| Chart 1 D− | 100 | 1 | 70/min (floor) | ~1:38, finishes early |
| Chart 3 C | 465 | 6 | 97/min | 6:00 |
| Chart 6 A+ | 600 | 7 | 141/min | 6:00 |

`cadence = clamp(steps / (allotment − jumpTime) × 60, 70, 200)`. Below the 70/min jog floor the run simply finishes early, which is what the booklet expects at low levels — *"You may not need the full 11 minutes when you start."*

Note the tension at the top: every second of jump window is taken out of the running time, so a generous window is what pushes Chart 6 A+ to 141 steps/min. `jumpWindowSeconds` per chart in the data file sets the default (12s for charts 1–3, 15s for the slower jumps in 4–6); Settings can override it.

## Notes

- Audio cue is a WebAudio beep; it needs the tap on "Start workout" to unlock, which is why cues are silent if you jump straight into a screen. Vibration is used where supported.
- The screen wake lock is requested during a workout where the browser supports it.
- History can be exported as JSON from the ⇩ button (copies to clipboard).
- Saving is best-effort but never silent: if `localStorage` refuses (quota, private browsing) the finish screen says the workout was **not** logged rather than returning to Today as though it had been.
- Storage keys: `fivebx.prefs.v1`, `fivebx.sessions.v1`, `fivebx.run.v1` (the in-flight workout).
- Not medical advice.
