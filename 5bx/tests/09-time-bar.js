/* The clock lives in a time bar above the controls.

   Run one:  node 5bx/tests/09-time-bar.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
const fillPct = p => p.evaluate(() => parseFloat(document.getElementById('timefill').style.width));
async function begin(page, level) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(l => { localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify({ chartId: 1, level: l,
      ex5Mode: 'stationary', seenWelcome: true, levelSeen: '1:' + l, metronome: true })); }, level || 'A+');
  await page.reload({ waitUntil: 'networkidle' });
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
}

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- where the clock lives now ---');
  await begin(page);
  check('the clock is in the time bar, not the body', await page.evaluate(() =>
    document.getElementById('timebar').contains(document.getElementById('clock'))), 'true');
  check('the bar sits directly above the controls', await page.evaluate(() => {
    const t = document.getElementById('timebar').getBoundingClientRect();
    const d = document.querySelector('#screen-work .dock').getBoundingClientRect();
    return t.bottom <= d.top + 1 && d.top - t.bottom < 24; }), 'true');
  check('and below the figure', await page.evaluate(() =>
    document.getElementById('timebar').getBoundingClientRect().top >
    document.getElementById('fig').getBoundingClientRect().bottom), 'true');

  console.log('--- the bar drains with the exercise ---');
  await page.click('#ready'); await page.waitForTimeout(250);
  const f0 = await fillPct(page);
  check('starts effectively full', f0 > 96, 'true');
  await page.waitForTimeout(2500);
  const f1 = await fillPct(page);
  check('drains as time passes', f1 < f0 - 1, 'true');
  check('and matches the clock', await page.evaluate(() => {
    const [m, s] = document.getElementById('clock').textContent.split(':').map(Number);
    const want = (m * 60 + s) / 120 * 100;
    const got = parseFloat(document.getElementById('timefill').style.width);
    return Math.abs(got - want) < 2; }), 'true');

  console.log('--- states that had to survive the move ---');
  await page.click('#btn-pause'); await page.waitForTimeout(200);
  check('pausing dims the bar', await page.evaluate(() =>
    document.getElementById('timebar').classList.contains('is-paused')), 'true');
  await page.click('#sheet-resume'); await page.waitForTimeout(200);
  check('resuming clears it', await page.evaluate(() =>
    document.getElementById('timebar').classList.contains('is-paused')), 'false');
  await page.evaluate(() => { window.__run.remaining = 4; });
  await page.waitForTimeout(400);
  check('running out marks the bar low', await page.evaluate(() =>
    document.getElementById('timebar').classList.contains('is-low')), 'true');

  console.log('--- the bar resets per exercise, on its own allotment ---');
  await page.evaluate(() => { window.__run.remaining = 60; });
  await page.click('#btn-next'); await page.waitForTimeout(200);
  await page.click('#ready'); await page.waitForTimeout(250);
  check('exercise 2 starts full again', await fillPct(page) > 96, 'true');
  check('against its own 1:00', await page.textContent('#clock'), '1:00');

  console.log('--- overlays ---');
  await page.click('#btn-next'); await page.waitForTimeout(250);
  check('the get-ready overlay covers the bar', await page.evaluate(() => {
    const r = document.getElementById('ready');
    return !r.hidden && getComputedStyle(r).zIndex > getComputedStyle(document.getElementById('timebar')).zIndex;
  }), 'true');
  await page.click('#ready'); await page.waitForTimeout(200);
  check('but the jump overlay does not', await page.evaluate(() =>
    +getComputedStyle(document.getElementById('timebar')).zIndex >
    +getComputedStyle(document.getElementById('jump')).zIndex), 'true');

  console.log('--- the header says which clock it is ---');
  check('header labels the 11 minutes', await page.textContent('.elapsed'), /of 11:00/.test(await page.textContent('.elapsed')) ? await page.textContent('.elapsed') : 'MISSING LABEL');
  check('header still counts exercise time', /^\d+:\d\d$/.test(await page.textContent('#work-elapsed')), 'true');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
