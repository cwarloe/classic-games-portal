# 5BX

A mobile-first, installable PWA for the RCAF **5BX Plan** (Five Basic Exercises, Dr. Bill Orban, 1961). No build step, no backend, no accounts — everything lives in `localStorage` on the device.

Open `5bx/index.html` over HTTP (the app `fetch`es its data file, so `file://` won't work). The repo's existing `server.js` already serves the directory statically: run `npm start` and visit `/5bx/`.

## Files

| File | What it is |
|---|---|
| `data/5bx-charts.json` | **All plan data.** Rep counts, step counts, run/walk times, exercise descriptions, age goals, progression rules. Hand-editable. |
| `index.html` | Screen markup (welcome, today, picker, workout, log, history, reference, settings). |
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

**Today** is the landing screen: your current level, the journey bar, today's targets and one big Start. The chart/level grid lives behind "Change" — for a returning user the answer is almost always "the level I'm on", and putting the picker up front quietly invited level-hopping.

## Progression rule

The booklet's rule is: move up one level only once you can complete *all* the required movements at your present level **within 11 minutes**. It also caps how fast you may climb, by age (1 day per level at 20 or under, up to 10 days per level at 60+).

The app applies both. After you log a session marked "completed within 11 minutes", the home screen suggests the next level — but only once you have logged sessions on at least the required number of distinct days at that level. Set your age on the Reference screen to enable the day requirement; leave it unset and only the 11-minute rule applies. `A+` on one chart advances to `D-` on the next.

## Where you start, and where you're going

Age sets the **goal**, never the starting point. The booklet is blunt about this:

> "Even if you feel able to start at a high level and progress at a faster rate than indicated — DON'T DO IT. Start at the bottom of Chart 1 and work up from level to level as recommended."

So the welcome collects an age, shows the goal it implies, and still starts everyone at Chart 1 D−. Age 38 → Chart 3 level B, which the app reports as 32 levels from the bottom — matching the booklet's own worked example.

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

- Exercise 5 can be swapped for the booklet's own alternatives (½ or 1 mile run, 1 or 2 mile walk). The timer then counts the alternative's allotted time, so the session runs longer than 11 minutes by design.
- Audio cue is a WebAudio beep; it needs the tap on "Start workout" to unlock, which is why cues are silent if you jump straight into a screen. Vibration is used where supported.
- The screen wake lock is requested during a workout where the browser supports it.
- History can be exported as JSON from the ⇩ button (copies to clipboard).
- Not medical advice.
