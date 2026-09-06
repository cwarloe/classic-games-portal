/* A substituted exercise 5 describes the substitution everywhere,
   not the stationary run.

   Run one:  node 5bx/tests/07-substitution.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
async function boot(page, mode, level) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(([m, l]) => { localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify({
      chartId: 1, level: l, ex5Mode: m, seenWelcome: true, levelSeen: '1:' + l })); }, [mode, level || 'D-']);
  await page.reload({ waitUntil: 'networkidle' });
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
}
async function toEx5(page) {
  await page.click('#btn-start'); await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(200);
  for (let i = 0; i < 4; i++) { await page.click('#btn-next'); await page.waitForTimeout(150);
    await page.click('#ready'); await page.waitForTimeout(130); }
}
const STALE = /scissor jumps|count a step each time|lift feet approximately/i;

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- the run substitution ---');
  await boot(page, 'run');
  await toEx5(page);
  check('name is no longer "Stationary run"', await page.textContent('#ex-name'), 'Distance run');
  check('target still correct', await page.textContent('#target-big'), '½ mile run');
  check('clock uses the run allotment', await page.textContent('#clock'), '8:00');
  const body = await page.textContent('#instructions');
  check('no stationary-run instructions', STALE.test(body), false);
  check('says the distance and the time', body.includes('½ mile run, in 8 min.'), 'true');
  check('quotes the booklet on substituting', body.includes('may be substituted'), 'true');
  check('warns the session runs long', body.includes('longer than 11 minutes'), 'true');
  check('explains the metronome staying off', body.includes('metronome'), 'true');
  check('no stationary-run illustration', await page.evaluate(() =>
    document.getElementById('fig').hidden), 'true');

  console.log('--- the get-ready break and the pause sheet ---');
  await page.click('#btn-prev'); await page.waitForTimeout(200);   // back to ex4's break
  await page.click('#ready'); await page.waitForTimeout(150);
  await page.click('#btn-next'); await page.waitForTimeout(300);    // ex5 break, overlay up
  check('break names the substitution', await page.textContent('#ready-name'), 'Distance run');
  check('break shows no illustration', await page.evaluate(() =>
    document.getElementById('ready-fig').hidden), 'true');
  await page.click('#ready'); await page.waitForTimeout(150);
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  check('pause sheet names it too', await page.evaluate(() =>
    document.querySelector('#sheet-list li:nth-child(5) .sheet__name').textContent.replace('you are here', '').trim()),
    'Distance run');
  await page.click('#sheet-home'); await page.waitForSelector('#screen-home:not([hidden])');
  check('paused banner names it', (await page.textContent('#resume-banner')).includes('Distance run'), 'true');
  page.once('dialog', d => d.accept());
  await page.click('#resume-banner .btn--ghost');
  await page.waitForTimeout(250);

  console.log('--- the preview screen agrees with the workout ---');
  await page.click('#screen-home [data-go="preview"]');
  await page.waitForSelector('#screen-preview:not([hidden])');
  const prev = await page.textContent('#preview-body');
  check('preview names the substitution', prev.includes('Distance run'), 'true');
  check('preview drops the stationary text', STALE.test(prev), false);
  check('preview shows 4 figures, not 5', await page.$$eval('.prev__fig', n => n.length), 4);
  check('preview shows the run allotment', prev.includes('8:00 allotted'), 'true');

  console.log('--- the walk substitution ---');
  await boot(page, 'walk');
  await toEx5(page);
  check('walk name', await page.textContent('#ex-name'), 'Distance walk');
  check('walk target', await page.textContent('#target-big'), '1 mile walk');
  check('walk distance and time', (await page.textContent('#instructions')).includes('1 mile walk, in 21 min.'), 'true');

  console.log('--- the stationary run is untouched ---');
  await boot(page, 'stationary');
  await toEx5(page);
  check('name', await page.textContent('#ex-name'), 'Stationary run');
  check('keeps the booklet instructions', STALE.test(await page.textContent('#instructions')), true);
  check('keeps its illustration', await page.evaluate(() =>
    !document.getElementById('fig').hidden && document.getElementById('fig-img').naturalWidth > 0), 'true');
  await page.click('#screen-home [data-go="preview"]').catch(() => {});

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
