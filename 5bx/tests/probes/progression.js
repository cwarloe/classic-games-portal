/* PROBE, not a test. These report what the app actually does so a human can
   judge it; they assert nothing and never fail. This is how the integrity
   bugs in 04-integrity.js were found - rerun them after big changes.

   Backgrounding, whether a skipped session can drive progression,
   changing exercise 5 mid-run, notices stacking on Today.

   node 5bx/tests/probes/progression.js   (needs a server on :8080, or set BASE_URL) */
const { URL, launch, phone } = require('../harness');
function probe(n, r) { console.log(`  ${n}\n     -> ${r}`); }
async function fresh(page, prefs) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(p => { localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(Object.assign({
      chartId: 1, level: 'D-', ex5Mode: 'stationary', age: null, seenWelcome: true, levelSeen: '1:D-' }, p || {}))); }, prefs);
  await page.reload({ waitUntil: 'networkidle' });
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

  console.log('\n=== H: backgrounding mid-workout ===');
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(400);
  const c0 = await page.textContent('#clock');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  probe('clock across 2.5s in background', 'before=' + c0 + ' after=' + (await page.textContent('#clock')));
  probe('splash interrupted the workout?', await page.evaluate(() =>
    !document.getElementById('screen-splash').hidden ? 'YES - BAD' : 'no (correct)'));

  console.log('\n=== I: does the skip hole feed progression? ===');
  await fresh(page);
  for (let day = 0; day < 1; day++) {
    await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
    await page.evaluate(() => { for (let i = 0; i < 8; i++) document.getElementById('btn-next').click(); });
    await page.waitForSelector('#screen-done:not([hidden])');
    await page.click('#btn-save');       // no manual answer needed - it is prefilled
    await page.waitForSelector('#screen-home:not([hidden])');
  }
  probe('a 3-second "workout" logged as', await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fivebx.sessions.v1'))[0];
    return 'duration=' + s.durationSeconds + 's completedInTime=' + s.completedInTime; }));
  probe('progression now says', (await page.textContent('#suggestion')).replace(/\s+/g, ' ').trim().slice(0, 120));

  console.log('\n=== J: change exercise-5 mode while paused ===');
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(200);
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home'); await page.waitForSelector('#screen-home:not([hidden])');
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.click('#ex5-picker .seg__btn:nth-child(2)');   // switch to the run
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  probe('run still uses the old exercise 5', await page.evaluate(() => {
    const r = window.__run; return 'step5 target="' + r.steps[4].target + '" seconds=' + r.steps[4].seconds; }));
  probe('Today chip meanwhile says', await page.evaluate(() => {
    document.getElementById('btn-quit').click(); return 'n/a'; }));

  console.log('\n=== K: notices stacking on Today ===');
  await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 100);
    localStorage.setItem('fivebx.sessions.v1', JSON.stringify([{ id: 'z', date: d.toISOString(),
      chartId: 1, level: 'D-', ex5Mode: 'stationary', durationSeconds: 650, completedInTime: true, notes: '' }]));
    const p = JSON.parse(localStorage.getItem('fivebx.prefs.v1'));
    p.chartId = 3; p.level = 'B'; delete p.layoffAck; delete p.levelSeen;
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(p));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
  probe('how many notices at once', await page.evaluate(() => {
    const ids = ['resume-banner', 'newlevel', 'layoff', 'suggestion'];
    const on = ids.filter(i => !document.getElementById(i).hidden);
    const sc = document.querySelector('#screen-home .scroll');
    return on.join(' + ') + '  (scroll height ' + sc.scrollHeight + 'px in a ' + sc.clientHeight + 'px viewport)';
  }));
  probe('is the level heading above the fold?', await page.evaluate(() => {
    const r = document.querySelector('.level-head').getBoundingClientRect();
    return r.top < window.innerHeight ? 'yes, at y=' + Math.round(r.top) : 'NO - pushed off screen at y=' + Math.round(r.top);
  }));

  console.log('\n=== errors ===');
  console.log(errs.length ? errs.join('\n') : '(none)');
  await b.close();
})();
