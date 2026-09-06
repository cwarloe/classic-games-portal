/* Data integrity: the five defects found by adversarial testing -
   wrong level logged, skips not recorded, lost workouts, back button,
   silent save failures.

   Run one:  node 5bx/tests/04-integrity.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
async function fresh(page, prefs) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(p => { localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(Object.assign({
      chartId: 1, level: 'D-', ex5Mode: 'stationary', age: null, seenWelcome: true, levelSeen: '1:D-' }, p || {}))); }, prefs);
  await page.reload({ waitUntil: 'networkidle' });
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
}
async function land(page) {
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
}

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- 1. a workout belongs to its own level ---');
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(200);
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home'); await page.waitForSelector('#screen-home:not([hidden])');
  await page.click('#screen-home [data-go="picker"]');
  await page.waitForSelector('#screen-picker:not([hidden])');
  await page.click('#chart-picker .seg__btn:nth-child(4)');
  await page.click('#level-picker .seg__btn:text-is("A")');
  await page.click('#screen-picker [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  check('Today shows the newly picked level', await page.textContent('#today-level'), 'Chart 4 · A');
  check('banner still describes the paused workout',
    (await page.textContent('#resume-banner')).includes('Chart 1 · D-'), 'true');
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  check('workout header keeps its own level', await page.textContent('#work-chart'), 'Chart 1 · D-');
  await page.click('#btn-pause'); await page.waitForTimeout(150);
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  check('pause sheet keeps its own level', await page.textContent('#sheet-title'), 'Chart 1 · D-');
  await page.click('#sheet-end'); await page.waitForSelector('#screen-done:not([hidden])');
  check('finish screen keeps its own level',
    (await page.textContent('#done-summary')).includes('Chart 1 · D-'), 'true');
  await page.click('#done-picker .seg__btn[data-done="yes"]');
  await page.click('#btn-save'); await page.waitForSelector('#screen-home:not([hidden])');
  check('LOGGED level is what was actually done', await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fivebx.sessions.v1'))[0];
    return s.chartId + ':' + s.level; }), '1:D-');

  console.log('--- 2. skipping is always recorded ---');
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.evaluate(() => { for (let i = 0; i < 8; i++) document.getElementById('btn-next').click(); });
  await page.waitForSelector('#screen-done:not([hidden])');
  check('no prefilled answer after skipping through', await page.evaluate(() => {
    const on = document.querySelector('#done-picker .seg__btn[aria-pressed="true"]');
    return on ? 'prefilled ' + on.dataset.done : 'blank'; }), 'blank');
  check('it says why', (await page.textContent('#done-summary')).includes('skipped ahead'), 'true');
  let alerted = false;
  page.once('dialog', async d => { alerted = true; await d.accept(); });
  await page.click('#btn-save'); await page.waitForTimeout(200);
  check('save refuses without an answer', alerted, 'true');

  console.log('--- 2b. an implausibly short session is never vouched for ---');
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(250);   // out of the get-ready break
  await page.evaluate(() => {                 // let it end on its own, with no time on the clock
    const r = window.__run;
    r.i = 4; r.remaining = 0.1; r.trans = 0; r.voicePending = false;
    r.skipped = false; r.exElapsed = 4;
  });
  await page.waitForSelector('#screen-done:not([hidden])', { timeout: 5000 });
  check('4 seconds is not "inside the allotment"',
    (await page.textContent('#done-summary')).includes('far short of a full session'), 'true');
  check('and it is not prefilled', await page.evaluate(() =>
    document.querySelectorAll('#done-picker .seg__btn[aria-pressed="true"]').length), 0);

  console.log('--- 3. a workout survives a reload ---');
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(1400);
  await page.click('#btn-next'); await page.waitForTimeout(200);   // now on exercise 2
  const elapsedBefore = await page.evaluate(() => Math.round(window.__run.exElapsed));
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  check('the workout came back', await page.evaluate(() => !!window.__run), 'true');
  check('came back paused', await page.evaluate(() => window.__run.paused), 'true');
  check('on the same exercise', await page.evaluate(() => window.__run.i + 1), 2);
  check('with its level intact', await page.evaluate(() => window.__run.chartId + ':' + window.__run.level), '1:D-');
  check('exercise time preserved', await page.evaluate(() => Math.round(window.__run.exElapsed)), elapsedBefore);
  check('Today offers it back', (await page.textContent('#resume-banner')).includes('exercise 2 of 5'), 'true');
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  check('resumes onto the right exercise', await page.textContent('#ex-num'), 'Exercise 2 of 5');
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  page.once('dialog', d => d.accept());
  await page.click('#sheet-discard'); await page.waitForSelector('#screen-home:not([hidden])');
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  check('a discarded workout stays discarded', await page.evaluate(() => !!window.__run), 'false');

  console.log('--- 3b. a stale snapshot is not resurrected ---');
  await page.evaluate(() => {
    localStorage.setItem('fivebx.run.v1', JSON.stringify({ chartId: 1, level: 'D-', ex5Mode: 'stationary',
      i: 2, remaining: 30, trans: 0, exElapsed: 100, totalElapsed: 100,
      startedAt: Date.now() - 86400000, skipped: false, savedAt: Date.now() - 86400000 }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  check('yesterday\'s workout is not offered', await page.evaluate(() => !!window.__run), 'false');
  check('and the snapshot is cleaned up', await page.evaluate(() =>
    localStorage.getItem('fivebx.run.v1') === null), 'true');

  console.log('--- 4. the back button backs out ---');
  await fresh(page);
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.goBack();
  await page.waitForTimeout(400);
  check('back from Settings lands on Today', await page.evaluate(() =>
    !document.getElementById('screen-home').hidden && document.getElementById('screen-settings').hidden), 'true');
  check('still in the app', page.url().includes('/5bx/'), 'true');
  await page.click('#screen-home [data-go="preview"]');
  await page.waitForSelector('#screen-preview:not([hidden])');
  await page.goBack();
  await page.waitForTimeout(400);
  check('back from Preview lands on Today', await page.evaluate(() =>
    !document.getElementById('screen-home').hidden), 'true');

  console.log('--- 4b. back during a workout pauses, it does not abandon ---');
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(500);
  check('still on the workout', await page.evaluate(() =>
    !document.getElementById('screen-work').hidden), 'true');
  check('pause sheet opened instead', await page.evaluate(() =>
    !document.getElementById('sheet').hidden), 'true');
  check('the run is intact', await page.evaluate(() => !!window.__run), 'true');
  await page.click('#sheet-resume');

  console.log('--- 5. a failed save is not silent ---');
  await page.evaluate(() => {
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      if (k === 'fivebx.sessions.v1') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      return orig(k, v); };
  });
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-end'); await page.waitForSelector('#screen-done:not([hidden])');
  await page.click('#done-picker .seg__btn[data-done="yes"]');
  let warned = '';
  page.once('dialog', async d => { warned = d.message(); await d.accept(); });
  await page.click('#btn-save');
  await page.waitForTimeout(300);
  check('the user is told the save failed', /NOT been logged/.test(warned), 'true');
  check('and is left on the finish screen', await page.evaluate(() =>
    !document.getElementById('screen-done').hidden), 'true');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
