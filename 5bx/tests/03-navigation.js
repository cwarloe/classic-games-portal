/* Navigation: the start screen waits, the tab bar reaches everything,
   and a workout can be left without losing it.

   Run one:  node 5bx/tests/03-navigation.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
const tabVisible = p => p.evaluate(() => !document.getElementById('tabbar').hidden);
const current = p => p.evaluate(() => {
  const t = document.querySelector('#tabbar .tab[aria-current="page"]');
  return t ? t.dataset.tab : 'none';
});

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- the start screen waits for you ---');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#screen-splash:not([hidden])');
  await page.waitForTimeout(3000);
  check('still on the start screen after 3s', await page.evaluate(() =>
    !document.getElementById('screen-splash').hidden), 'true');
  check('it says how to leave', await page.textContent('#splash-hint'), 'tap to begin');
  check('no tab bar on the start screen', await tabVisible(page), false);
  await page.click('#screen-splash');
  await page.waitForSelector('#screen-welcome:not([hidden])');
  check('no tab bar during the welcome', await tabVisible(page), false);
  await page.click('#wel-skip');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- the tab bar ---');
  check('tab bar on Today', await tabVisible(page), true);
  check('Today is the current tab', await current(page), 'home');
  check('four tabs', await page.$$eval('#tabbar .tab', n => n.length), 4);
  for (const t of ['history', 'reference', 'settings', 'home']) {
    await page.click(`#tabbar .tab[data-tab="${t}"]`);
    await page.waitForSelector(`#screen-${t}:not([hidden])`);
    check(`tab ${t} navigates and marks itself`, await current(page), t);
  }
  check('tab bar survives the round trip', await tabVisible(page), true);

  console.log('--- the bar must not sit on top of anything ---');
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.click('#adv .adv__summary');
  await page.waitForTimeout(200);
  await page.evaluate(() => { const s = document.querySelector('#screen-settings .scroll'); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(250);
  check('last setting clears the bar', await page.evaluate(() => {
    const r = document.getElementById('btn-reset').getBoundingClientRect();
    const bar = document.getElementById('tabbar').getBoundingClientRect();
    return r.height > 0 && r.bottom <= bar.top + 1;
  }), 'true');
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- focused flows hide it ---');
  await page.click('#screen-home [data-go="preview"]');
  await page.waitForSelector('#screen-preview:not([hidden])');
  check('no tab bar on preview', await tabVisible(page), false);
  await page.click('#screen-preview [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  await page.click('#screen-home [data-go="picker"]');
  await page.waitForSelector('#screen-picker:not([hidden])');
  check('no tab bar on the level picker', await tabVisible(page), false);
  await page.click('#screen-picker [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- leaving a workout without losing it ---');
  check('start button reads Start', await page.textContent('#btn-start'), 'Start workout');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  check('no tab bar during a workout', await tabVisible(page), false);
  await page.click('#ready');
  await page.waitForTimeout(200);
  await page.click('#btn-next'); await page.waitForTimeout(160);
  await page.click('#ready'); await page.waitForTimeout(1200);
  const elapsedAway = await page.textContent('#work-elapsed');

  await page.click('#btn-quit');
  await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home');
  await page.waitForSelector('#screen-home:not([hidden])');
  check('back on Today with the tab bar', await tabVisible(page), true);
  check('resume banner shown', await page.evaluate(() => !document.getElementById('resume-banner').hidden), 'true');
  check('banner names the exercise', (await page.textContent('#resume-banner')).includes('exercise 2 of 5'), 'true');
  check('start button becomes resume', await page.textContent('#btn-start'), 'Resume workout');

  await page.click('#tabbar .tab[data-tab="reference"]');
  await page.waitForSelector('#screen-reference:not([hidden])');
  await page.waitForTimeout(1500);
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  check('workout survives a wander', await page.evaluate(() => !!window.__run), 'true');

  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  check('resumed the same workout, not a new one', await page.textContent('#ex-num'), 'Exercise 2 of 5');
  check('clock did not run while away', await page.textContent('#work-elapsed'), elapsedAway);
  await page.click('#btn-pause');       // it is paused; this resumes
  await page.waitForTimeout(100);

  console.log('--- discarding from Today ---');
  await page.click('#btn-quit');
  await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home');
  await page.waitForSelector('#screen-home:not([hidden])');
  page.once('dialog', d => d.accept());
  await page.click('#resume-banner .btn--ghost');
  await page.waitForTimeout(200);
  check('workout discarded', await page.evaluate(() => !!window.__run), 'false');
  check('banner gone', await page.evaluate(() => document.getElementById('resume-banner').hidden), 'true');
  check('start button back to Start', await page.textContent('#btn-start'), 'Start workout');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
