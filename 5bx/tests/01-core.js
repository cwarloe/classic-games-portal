/* Core walkthrough: welcome, targets, preview, a full workout,
   progression, layoff, the metronome, history and offline.

   Run one:  node 5bx/tests/01-core.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
function note(s) { console.log('      ' + s); }

async function seen(page) {           // skip the welcome
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('fivebx.prefs.v1') || '{}');
    p.seenWelcome = true;
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(p));
  });
}
async function land(page) {              // the start screen waits for a tap now
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) {
    await page.click('#screen-splash');
  }
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
}
async function setLevel(page, chart, level) {
  await page.click('#screen-home [data-go="picker"]');
  await page.waitForSelector('#screen-picker:not([hidden])');
  if (chart) await page.click(`#chart-picker .seg__btn:nth-child(${chart})`);
  if (level) await page.click(`#level-picker .seg__btn:text-is("${level}")`);
  await page.click('#screen-picker [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
}

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- welcome & landing ---');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#screen-splash:not([hidden])');
  await page.click('#screen-splash');
  await page.waitForSelector('#screen-welcome:not([hidden])');
  check('first run shows welcome', true, true);
  await page.click('#wel-skip');
  await page.waitForSelector('#screen-home:not([hidden])');
  check('skip lands on Today', await page.textContent('#today-level'), 'Chart 1 · D-');
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  check('welcome not shown again', await page.evaluate(() => document.getElementById('screen-welcome').hidden), 'true');

  console.log('--- targets & data ---');
  const t1 = await page.$$eval('#targets .t-reps', n => n.map(x => x.textContent.trim()));
  check('chart 1 D- targets', t1.join('|'), '2 reps|3 reps|4 reps|2 reps|100 steps');
  await setLevel(page, 3, 'B');
  const t3 = await page.$$eval('#targets .t-reps', n => n.map(x => x.textContent.trim()));
  check('chart 3 B targets', t3.join('|'), '28 reps|27 reps|39 reps|19 reps|500 steps');

  console.log('--- preview ---');
  await page.click('[data-go="preview"]');
  await page.waitForSelector('#screen-preview:not([hidden])');
  check('preview lists 5 exercises', await page.$$eval('.prev', c => c.length), 5);
  check('preview figures load', await page.$$eval('.prev__fig', i => i.every(x => x.naturalWidth > 0)), 'true');
  await page.click('#screen-preview [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- workout walkthrough ---');
  await setLevel(page, 1, 'D-');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.waitForTimeout(300);
  check('get-ready overlay shown', await page.evaluate(() => !document.getElementById('ready').hidden), 'true');
  check('clock held during get-ready', await page.textContent('#clock'), '2:00');
  await page.click('#ready');            // start now
  await page.waitForTimeout(200);
  await page.waitForTimeout(300);
  check('ex1 name', await page.textContent('#ex-name'), 'Toe touching');
  check('ex1 figure loaded', await page.evaluate(() => document.getElementById('fig-img').naturalWidth > 0), 'true');
  const c1 = await page.textContent('#clock');
  await page.waitForTimeout(1600);
  check('clock counts down', (await page.textContent('#clock')) !== c1, 'true');
  for (let i = 0; i < 4; i++) {
    await page.click('#btn-next'); await page.waitForTimeout(180);
    await page.click('#ready'); await page.waitForTimeout(140);
  }
  check('reaches ex5', await page.textContent('#ex-num'), 'Exercise 5 of 5');
  check('ex5 figure loaded', await page.evaluate(() => document.getElementById('fig-img').naturalWidth > 0), 'true');

  await page.click('#btn-next');
  await page.waitForSelector('#screen-done:not([hidden])');
  let alerted = false;
  page.once('dialog', async d => { alerted = true; await d.accept(); });
  await page.click('#btn-save');
  await page.waitForTimeout(200);
  check('save blocked without answer', alerted, 'true');
  await page.click('#done-picker .seg__btn[data-done="yes"]');
  await page.fill('#notes', 'regression run');
  await page.click('#btn-save');
  await page.waitForSelector('#screen-home:not([hidden])');
  check('session logged, meta updates', (await page.textContent('#today-meta')).includes('1 day'), 'true');

  console.log('--- progression ---');
  const sugg = await page.textContent('#suggestion');
  check('suggests moving up', sugg.includes('Chart 1 D'), 'true');
  await page.click('#suggestion .btn');
  check('moved up a level', await page.textContent('#today-level'), 'Chart 1 · D');

  await page.evaluate(() => {   // age gate: 45 needs 7 days
    const p = JSON.parse(localStorage.getItem('fivebx.prefs.v1'));
    p.age = 45; p.chartId = 1; p.level = 'D-'; p.levelSeen = '1:D-';
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(p));
    localStorage.setItem('fivebx.sessions.v1', JSON.stringify([{ id: '1', date: new Date().toISOString(),
      chartId: 1, level: 'D-', ex5Mode: 'stationary', durationSeconds: 640, completedInTime: true, notes: '' }]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  check('age gate holds', (await page.textContent('#suggestion')).includes('6 more days'), 'true');

  await page.evaluate(() => {   // A+ rollover
    const p = JSON.parse(localStorage.getItem('fivebx.prefs.v1'));
    p.chartId = 2; p.level = 'A+'; p.age = 25; p.levelSeen = '2:A+';
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(p));
    const s = [];
    for (let i = 0; i < 3; i++) { const d = new Date(); d.setDate(d.getDate() - i);
      s.push({ id: 'r' + i, date: d.toISOString(), chartId: 2, level: 'A+', ex5Mode: 'stationary',
               durationSeconds: 650, completedInTime: true, notes: '' }); }
    localStorage.setItem('fivebx.sessions.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  await page.click('#suggestion .btn');
  check('A+ rolls to next chart', await page.textContent('#today-level'), 'Chart 3 · D-');

  console.log('--- layoff ---');
  await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 100);
    localStorage.setItem('fivebx.sessions.v1', JSON.stringify([{ id: 'z', date: d.toISOString(),
      chartId: 3, level: 'B', ex5Mode: 'stationary', durationSeconds: 650, completedInTime: true, notes: '' }]));
    const p = JSON.parse(localStorage.getItem('fivebx.prefs.v1'));
    p.chartId = 3; p.level = 'B'; p.levelSeen = '3:B'; delete p.layoffAck;
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(p));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  await page.waitForSelector('#layoff:not([hidden])', { timeout: 6000 });
  check('long layoff recommends Chart 1', (await page.textContent('#layoff')).includes('Chart 1 D-'), 'true');
  await page.click('#layoff .btn--ghost');
  await page.waitForTimeout(150);
  check('declining keeps level', await page.textContent('#today-level'), 'Chart 3 · B');
  check('notice dismissed', await page.evaluate(() => document.getElementById('layoff').hidden), 'true');

  console.log('--- metronome ---');
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.click('#set-metro');
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  await setLevel(page, 1, 'D-');
  await page.click('#btn-start');
  for (let i = 0; i < 4; i++) {
    await page.click('#btn-next'); await page.waitForTimeout(180);
    await page.click('#ready'); await page.waitForTimeout(120);
  }
  await page.evaluate(() => { const M = window.__metro; M.periodMs = 45; M.windowMs = 2500; M.nextAt = Date.now() + 45; });
  let ph = '';
  for (let i = 0; i < 90 && ph !== 'jumping'; i++) { await page.waitForTimeout(80); ph = await page.evaluate(() => window.__metro.phase); }
  const before = await page.evaluate(() => window.__metro.steps);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__metro.steps);
  check('steps frozen during jumps', `${before}->${after}`, `75->75`);
  await page.click('#btn-quit');
  await page.waitForSelector('#sheet:not([hidden])');
  page.once('dialog', d => d.accept());
  await page.click('#sheet-discard');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- history & reference ---');
  await page.click('#tabbar .tab[data-tab="history"]');
  await page.waitForSelector('#screen-history:not([hidden])');
  note('stats: ' + (await page.textContent('#stats')).replace(/\s+/g, ' ').trim());
  await page.click('#tabbar .tab[data-tab="reference"]');
  await page.waitForSelector('#screen-reference:not([hidden])');
  const ages = await page.$$eval('#reference-body .ref-table tbody tr', r => r.slice(0, 3).map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check('age table sorted', ages.join('|'), '6 yrs1B|7 yrs1A|8 yrs2D-');
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- offline ---');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await land(page);
  const off = await page.$$eval('#targets .t-reps', n => n.map(x => x.textContent.trim()));
  check('offline renders targets', off.length, 5);
  check('offline figure cached', await page.evaluate(async () => {
    const r = await caches.match('./figures/c1e1.png'); return !!r;
  }), 'true');
  await ctx.setOffline(false);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
