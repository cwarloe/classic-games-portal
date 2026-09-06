/* PROBE, not a test. These report what the app actually does so a human can
   judge it; they assert nothing and never fail. This is how the integrity
   bugs in 04-integrity.js were found - rerun them after big changes.

   Corrupt stored state, what level a workout logs, double-tap Start,
   skipping past the end, the back button, backgrounding mid-workout.

   node 5bx/tests/probes/state-and-timing.js   (needs a server on :8080, or set BASE_URL) */
const { URL, launch, phone } = require('../harness');
function probe(n, r) { console.log(`  ${n}\n     -> ${r}`); }
async function fresh(page, prefs) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(p => {
    localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(Object.assign({
      chartId: 1, level: 'D-', ex5Mode: 'stationary', age: null, seenWelcome: true, levelSeen: '1:D-'
    }, p || {})));
  }, prefs);
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

  console.log('\n=== A2 dig: bad chart/level ===');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify({ chartId: 99, level: 'ZZZ', seenWelcome: true })); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForTimeout(600);
  probe('stored prefs after boot normalisation', await page.evaluate(() =>
    JSON.stringify(JSON.parse(localStorage.getItem('fivebx.prefs.v1')))));
  probe('what Today renders', await page.evaluate(() =>
    'level="' + document.getElementById('today-level').textContent + '" targets=' +
    document.querySelectorAll('#targets li').length + ' totalline="' +
    document.getElementById('total-line').textContent.trim() + '"'));
  probe('can you still start?', await page.evaluate(() => {
    try { document.getElementById('btn-start').click(); }
    catch (e) { return 'THREW ' + e.message; }
    return document.getElementById('screen-work').hidden ? 'no - stayed on home' : 'yes - workout started';
  }));
  probe('errors during that', errs.length ? errs.join(' | ') : '(none)');

  console.log('\n=== B dig: what level gets LOGGED ===');
  errs.length = 0;
  await fresh(page);
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(200);
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home'); await page.waitForSelector('#screen-home:not([hidden])');
  await page.click('#screen-home [data-go="picker"]');
  await page.waitForSelector('#screen-picker:not([hidden])');
  await page.click('#chart-picker .seg__btn:nth-child(4)');
  await page.click('#level-picker .seg__btn:text-is("A")');
  await page.click('#screen-picker [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.evaluate(() => document.getElementById('btn-pause').click());  // unpause
  await page.waitForTimeout(200);
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-end');
  await page.waitForSelector('#screen-done:not([hidden])');
  probe('finish screen header', (await page.textContent('#screen-done .scroll')).replace(/\s+/g,' ').slice(0, 160));
  await page.click('#done-picker .seg__btn[data-done="yes"]');
  await page.click('#btn-save');
  await page.waitForSelector('#screen-home:not([hidden])');
  probe('LOGGED session', await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fivebx.sessions.v1'))[0];
    return 'chartId=' + s.chartId + ' level=' + s.level + '  (the exercises actually done were Chart 1 D-)';
  }));

  console.log('\n=== D dig: double-tap Start ===');
  errs.length = 0;
  await fresh(page);
  await page.evaluate(() => {
    const b = document.getElementById('btn-start');
    b.click(); b.click();          // two taps in the same frame
  });
  await page.waitForTimeout(600);
  probe('after two synchronous taps', await page.evaluate(() =>
    'work screen=' + !document.getElementById('screen-work').hidden +
    '; ready overlay=' + !document.getElementById('ready').hidden +
    '; trans=' + (window.__run ? window.__run.trans.toFixed(1) : 'n/a') +
    '; step=' + (window.__run ? window.__run.i : 'n/a')));
  await page.waitForTimeout(1500);
  probe('1.5s later, clock', await page.evaluate(() =>
    'clock=' + document.getElementById('clock').textContent +
    '; ready=' + !document.getElementById('ready').hidden +
    '; exElapsed=' + (window.__run ? window.__run.exElapsed.toFixed(1) : 'n/a')));
  probe('errors', errs.length ? errs.join(' | ') : '(none)');

  console.log('\n=== D2: spam Next past the end ===');
  errs.length = 0;
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.evaluate(() => { for (let i = 0; i < 12; i++) document.getElementById('btn-next').click(); });
  await page.waitForTimeout(600);
  probe('after 12 rapid Next', await page.evaluate(() =>
    'done screen=' + !document.getElementById('screen-done').hidden +
    '; run=' + (window.__run ? 'alive' : 'cleared')));
  probe('prefilled "completed in 11 min"?', await page.evaluate(() => {
    const on = document.querySelector('#done-picker .seg__btn[aria-pressed="true"]');
    return on ? 'PREFILLED "' + on.dataset.done + '"' : 'left blank (correct - exercises were skipped)';
  }));
  probe('errors', errs.length ? errs.join(' | ') : '(none)');

  console.log('\n=== G: hardware back button ===');
  errs.length = 0;
  await fresh(page);
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
  const before = page.url();
  await page.goBack({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(900);
  probe('back from Settings', 'url before=' + before + ' after=' + page.url());
  probe('  what happened', await page.evaluate(() =>
    'splash=' + !document.getElementById('screen-splash').hidden +
    '; settings=' + !document.getElementById('screen-settings').hidden +
    '; home=' + !document.getElementById('screen-home').hidden));

  console.log('\n=== H: workout with the screen backgrounded ===');
  errs.length = 0;
  await fresh(page);
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(400);
  const c0 = await page.textContent('#clock');
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { value: true, configurable: true }) &&
    document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(2500);
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { value: false, configurable: true }) &&
    document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  probe('clock across a 2.5s background', 'before=' + c0 + ' after=' + (await page.textContent('#clock')) +
    ' (should have counted down ~2.5s)');
  probe('splash interrupted the workout?', await page.evaluate(() =>
    !document.getElementById('screen-splash').hidden ? 'YES - workout hidden' : 'no (correct)'));
  probe('errors', errs.length ? errs.join(' | ') : '(none)');

  await b.close();
})();
