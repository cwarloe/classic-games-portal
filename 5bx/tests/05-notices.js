/* Today shows one notice at a time, in priority order.

   Run one:  node 5bx/tests/05-notices.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
const visible = p => p.evaluate(() => ['resume-banner', 'layoff', 'newlevel', 'suggestion']
  .filter(i => !document.getElementById(i).hidden).join(',') || 'none');
async function land(page) {
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
}
// every notice eligible at once: 100 days since a cleared session, level never viewed
async function allEligible(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify({
      chartId: 3, level: 'B', ex5Mode: 'stationary', age: null, seenWelcome: true }));
    const d = new Date(); d.setDate(d.getDate() - 100);
    localStorage.setItem('fivebx.sessions.v1', JSON.stringify([{ id: 'a', date: d.toISOString(),
      chartId: 3, level: 'B', ex5Mode: 'stationary', durationSeconds: 650, totalSeconds: 700,
      completedInTime: true, notes: '' }]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
}

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- all four eligible at once ---');
  await allEligible(page);
  check('without a workout, layoff wins', await visible(page), 'layoff');
  const tall = await page.evaluate(() => {
    const s = document.querySelector('#screen-home .scroll');
    return s.scrollHeight;
  });
  check('Today fits without a wall of banners', tall < 1000, 'true');
  check('level heading is near the top', await page.evaluate(() =>
    Math.round(document.querySelector('.level-head').getBoundingClientRect().top) < 380), 'true');

  console.log('--- a paused workout outranks everything ---');
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home'); await page.waitForSelector('#screen-home:not([hidden])');
  check('only the resume banner shows', await visible(page), 'resume-banner');
  check('and the dock offers the way back', await page.textContent('#btn-start'), 'Resume workout');

  console.log('--- dealing with one surfaces the next ---');
  page.once('dialog', d => d.accept());
  await page.click('#resume-banner .btn--ghost');       // discard
  await page.waitForTimeout(250);
  check('layoff surfaces once the workout is gone', await visible(page), 'layoff');
  await page.click('#layoff .btn--ghost');              // keep my level
  await page.waitForTimeout(250);
  check('then the new level brief', await visible(page), 'newlevel');
  await page.click('#newlevel .btn--ghost');            // dismiss
  await page.waitForTimeout(250);
  check('then the progression suggestion', await visible(page), 'suggestion');
  check('suggestion is the real one', (await page.textContent('#suggestion')).includes('Ready to move up'), 'true');

  console.log('--- the contradiction is gone ---');
  await allEligible(page);
  check('never "drop back" and "move up" together', await page.evaluate(() => {
    const t = document.querySelector('#screen-home .scroll').textContent;
    return t.includes('drop back several levels') && t.includes('Ready to move up');
  }), 'false');

  console.log('--- ordinary days are unaffected ---');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify({ chartId: 1, level: 'D-',
      ex5Mode: 'stationary', age: null, seenWelcome: true, levelSeen: '1:D-' }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
  check('nothing to say, nothing shown', await visible(page), 'none');
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home'); await page.waitForSelector('#screen-home:not([hidden])');
  check('a lone paused workout still shows', await visible(page), 'resume-banner');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
