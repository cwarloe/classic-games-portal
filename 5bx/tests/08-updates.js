/* A new deploy is picked up on the first relaunch, and never
   reloads out from under a workout.

   Run one:  node 5bx/tests/08-updates.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
const fs = require('fs');
const R = require('path').join(__dirname, '..') + '/';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
const APP = fs.readFileSync(R + 'app.js', 'utf8');
const SW = fs.readFileSync(R + 'sw.js', 'utf8');
function ship(tag) {          // pretend a new version was deployed
  const app = APP.replace("var K_RUN = 'fivebx.run.v1';",
    "var K_RUN = 'fivebx.run.v1'; window.__V = '" + tag + "';");
  const sw = SW.replace(/'5bx-v[0-9]+'/, "'5bx-test-" + tag + "'");
  if (app === APP || sw === SW) { console.error('FAIL  the test could not patch a new version in'); process.exit(1); }
  fs.writeFileSync(R + 'app.js', app);
  fs.writeFileSync(R + 'sw.js', sw);
}
function restore() {
  try {
    if (fs.readFileSync(R + 'app.js', 'utf8') !== APP) fs.writeFileSync(R + 'app.js', APP);
    if (fs.readFileSync(R + 'sw.js', 'utf8') !== SW) fs.writeFileSync(R + 'sw.js', SW);
  } catch (e) { console.error('COULD NOT RESTORE app.js / sw.js: ' + e.message); }
}
// This suite is the only one that writes to the working tree. Restore on every
// exit path - a failed assertion, a crash, or Ctrl-C - so a test run can never
// leave the checkout modified.
process.on('exit', restore);
process.on('SIGINT', function () { restore(); process.exit(130); });
const version = p => p.evaluate(() => window.__V || 'OLD');
async function settle(page, ms) { await page.waitForTimeout(ms || 1500); }
async function install(ctx) {
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await settle(page, 800);
  return page;
}

(async () => {
  const b = await launch();
  const errs = [];

  console.log('--- a new deploy lands on the first relaunch ---');
  let ctx = await phone(b, 390, 844);
  let page = await install(ctx);
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  check('starts on the installed version', await version(page), 'OLD');
  ship('A');
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page, 2500);
  check('one relaunch is enough now', await version(page), 'A');
  check('old caches cleaned up', await page.evaluate(async () => (await caches.keys()).join()), '5bx-test-A');
  check('and it lands on a usable screen', await page.evaluate(() =>
    !document.getElementById('screen-splash').hidden || !document.getElementById('screen-home').hidden), 'true');
  await ctx.close();

  console.log('--- it does not reload on a first install ---');
  restore();
  ctx = await phone(b, 390, 844);
  page = await ctx.newPage();
  let loads = 0;
  page.on('load', () => loads++);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  check('first ever visit loads exactly once', loads, 1);
  await ctx.close();

  console.log('--- it never reloads out from under a workout ---');
  ctx = await phone(b, 390, 844);
  page = await install(ctx);
  await page.evaluate(() => { localStorage.setItem('fivebx.prefs.v1', JSON.stringify({
    chartId: 1, level: 'D-', ex5Mode: 'stationary', seenWelcome: true, levelSeen: '1:D-' })); });
  await page.reload({ waitUntil: 'networkidle' });
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) await page.click('#screen-splash');
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#ready');
  await page.waitForTimeout(1200);
  const before = await page.textContent('#clock');
  loads = 0;
  page.on('load', () => loads++);
  ship('B');                                   // deploy while the workout runs
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update()));
  await settle(page, 3000);
  check('the workout was not reloaded away', loads, 0);
  check('still on the workout screen', await page.evaluate(() =>
    !document.getElementById('screen-work').hidden), 'true');
  check('the run is intact', await page.evaluate(() => !!window.__run), 'true');
  check('the clock kept running', (await page.textContent('#clock')) !== before, 'true');
  // and the deferred update is not lost: the next launch is simply the new code
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page, 1500);
  check('next launch has the new version anyway', await version(page), 'B');
  await ctx.close();

  restore();
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  restore();
  console.error('FAIL  ' + (e && e.message ? e.message : e));
  console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed');
  process.exit(1);
});
