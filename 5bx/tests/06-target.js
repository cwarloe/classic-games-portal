/* The rep count is the hero of the workout screen.

   Run one:  node 5bx/tests/06-target.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
const px = (page, sel, prop) => page.evaluate(([s, p]) =>
  parseFloat(getComputedStyle(document.querySelector(s))[p]), [sel, prop]);
async function begin(page, prefs) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(p => { localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(Object.assign({
      chartId: 1, level: 'A+', ex5Mode: 'stationary', seenWelcome: true, levelSeen: '1:A+' }, p))); }, prefs || {});
  await page.reload({ waitUntil: 'networkidle' });
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(250);
}
async function toEx5(page) {
  for (let i = 0; i < 4; i++) { await page.click('#btn-next'); await page.waitForTimeout(140);
    await page.click('#ready'); await page.waitForTimeout(120); }
}

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- the count is split out and huge ---');
  await begin(page);
  check('count rendered on its own', await page.textContent('#target-big .target-big__n'), '20');
  check('unit rendered beside it', await page.textContent('#target-big .target-big__u'), 'reps');
  const nSize = await px(page, '.target-big__n', 'fontSize');
  const cSize = await px(page, '.timebar__t', 'fontSize');
  check('the count is the largest thing on the screen', nSize > cSize, 'true');
  check('and it is genuinely large (was 17px)', nSize >= 64, 'true');
  check('the clock numeral stays legible', cSize >= 22, 'true');
  check('the unit stays subordinate', await px(page, '.target-big__u', 'fontSize') < nSize / 2, 'true');
  check('no pill border at this size', await px(page, '.target-big', 'borderTopWidth'), 0);

  console.log('--- exercise 5 counts steps the same way ---');
  await toEx5(page);
  check('step count', await page.textContent('#target-big .target-big__n'), '400');
  check('step unit', await page.textContent('#target-big .target-big__u'), 'steps');

  console.log('--- a substitution has no count, so the label carries it ---');
  await begin(page, { level: 'D-', ex5Mode: 'run', levelSeen: '1:D-' });
  await toEx5(page);
  check('no count element', await page.$$eval('#target-big .target-big__n', n => n.length), 0);
  check('label is the target', await page.textContent('#target-big'), '½ mile run');
  check('label mode styling applied', await page.evaluate(() =>
    document.getElementById('target-big').classList.contains('target-big--label')), 'true');
  const labelSize = await px(page, '.target-big__u', 'fontSize');
  check('label readable but not as loud as a count', labelSize >= 30 && labelSize < 64, 'true');
  await ctx.close();

  console.log('--- fits on a small phone ---');
  const ctx2 = await phone(b, 375, 667);
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await begin(p2);
  check('name and target both above the fold', await p2.evaluate(() => {
    const bot = document.getElementById('target-big').getBoundingClientRect().bottom;
    const top = document.getElementById('ex-name').getBoundingClientRect().top;
    return top >= 0 && bot < window.innerHeight; }), 'true');
  await toEx5(p2);
  check('still above the fold on the longest exercise', await p2.evaluate(() =>
    document.getElementById('target-big').getBoundingClientRect().bottom < window.innerHeight), 'true');
  check('nothing overflows sideways', await p2.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth), 'true');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
