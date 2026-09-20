/* Text size: every font size is rem, so one setting moves the whole app - and
   nothing may overflow or become unreachable at the largest step.

   Run one:  node 5bx/tests/11-text-size.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone, boot } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
const px = (page, sel) => page.evaluate(s =>
  parseFloat(getComputedStyle(document.querySelector(s)).fontSize), sel);
const setSize = async (page, size) => {
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.click(`#set-text .seg__btn[data-text="${size}"]`);
  await page.waitForTimeout(150);
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
};
const noSideScroll = page => page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const b = await launch();
  const ctx = await phone(b);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- nothing is hard-coded in px any more ---');
  await boot(page, {});
  check('no px font sizes left in the stylesheet', await page.evaluate(async () => {
    const css = await (await fetch('styles.css')).text();
    return (css.match(/font-size:\s*[0-9.]+px/g) || []).length;
  }), 0);
  check('default follows the browser (16px root)', await px(page, 'html'), 16);

  console.log('--- the setting moves everything together ---');
  const baseline = {
    level: await px(page, '#today-level'),
    target: await px(page, '.t-reps'),
    button: await px(page, '#btn-start')
  };
  await setSize(page, 'xlarge');
  check('root scales to 125%', await px(page, 'html'), 20);
  check('the level heading grew', (await px(page, '#today-level')) > baseline.level, 'true');
  check('the targets grew', (await px(page, '.t-reps')) > baseline.target, 'true');
  check('the buttons grew', (await px(page, '#btn-start')) > baseline.button, 'true');
  check('everything grew by the same factor', await page.evaluate(() =>
    Math.abs(parseFloat(getComputedStyle(document.getElementById('today-level')).fontSize) /
             parseFloat(getComputedStyle(document.getElementById('btn-start')).fontSize) - 1.5) < 0.6
  ), 'true');

  console.log('--- and back down ---');
  await setSize(page, 'small');
  check('small is below default', (await px(page, 'html')) < 16, 'true');
  await setSize(page, 'default');
  check('default returns to the baseline', await px(page, '#today-level'), baseline.level);

  console.log('--- it survives a reload ---');
  await setSize(page, 'large');
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])');
  check('setting persisted', await page.evaluate(() =>
    document.documentElement.getAttribute('data-text')), 'large');
  check('applied before you see anything', await px(page, 'html'), 18);

  console.log('--- nothing breaks at the largest step ---');
  await setSize(page, 'xlarge');
  check('Today does not scroll sideways', await noSideScroll(page), 'true');
  check('Start is still reachable', await page.evaluate(() => {
    const r = document.getElementById('btn-start').getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.width > 100; }), 'true');
  check('the tab bar still fits four tabs', await page.evaluate(() => {
    const t = [...document.querySelectorAll('#tabbar .tab')];
    return t.length === 4 && t.every(x => x.getBoundingClientRect().width > 40); }), 'true');

  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready'); await page.waitForTimeout(250);
  check('the workout does not scroll sideways', await noSideScroll(page), 'true');
  check('the rep count still fits on one line', await page.evaluate(() => {
    const n = document.querySelector('.target-big__n');
    return n.scrollWidth <= n.clientWidth + 2; }), 'true');
  check('the time bar keeps its numeral on screen', await page.evaluate(() => {
    const r = document.getElementById('clock').getBoundingClientRect();
    return r.right <= window.innerWidth + 1 && r.left > 0; }), 'true');
  check('the controls are all still on screen', await page.evaluate(() =>
    [...document.querySelectorAll('#screen-work .dock .btn')]
      .every(x => { const r = x.getBoundingClientRect();
        return r.bottom <= window.innerHeight + 1 && r.left >= -1; })), 'true');

  console.log('--- and on a small phone at the largest step ---');
  await ctx.close();
  const small = await phone(b, 375, 667);
  const p2 = await small.newPage();
  p2.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await boot(p2, { textSize: 'xlarge' });
  check('Today still fits', await noSideScroll(p2), 'true');
  check('Start still reachable', await p2.evaluate(() => {
    const r = document.getElementById('btn-start').getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1; }), 'true');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
