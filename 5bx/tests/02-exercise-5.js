/* Exercise 5: the stationary run is primary, substitutions live in
   Settings, and the walk disappears above Chart 4.

   Run one:  node 5bx/tests/02-exercise-5.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
async function setLevel(page, chart, level) {
  await page.click('#screen-home [data-go="picker"]');
  await page.waitForSelector('#screen-picker:not([hidden])');
  if (chart) await page.click(`#chart-picker .seg__btn:nth-child(${chart})`);
  if (level) await page.click(`#level-picker .seg__btn:text-is("${level}")`);
  await page.click('#screen-picker [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
}
async function settings(page) {
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
}
async function backHome(page) {
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
}

(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#screen-splash:not([hidden])');
  await page.click('#screen-splash');
  await page.click('#wel-skip');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- default is the stationary run ---');
  check('boot default mode', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fivebx.prefs.v1')).ex5Mode), 'stationary');
  check('no chip when not substituted', await page.evaluate(() => document.getElementById('today-sub').hidden), 'true');
  check('ex5 target is steps', (await page.$$eval('#targets .t-reps', n => n.map(x => x.textContent.trim())))[4], '100 steps');

  console.log('--- picker no longer offers exercise 5 ---');
  await page.click('#screen-home [data-go="picker"]');
  await page.waitForSelector('#screen-picker:not([hidden])');
  check('no ex5 field on the level picker', await page.$$eval('#screen-picker #ex5-picker', n => n.length), 0);
  await page.click('#screen-picker [data-go="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- settings owns it, with hierarchy ---');
  await settings(page);
  check('ex5 picker lives in settings', await page.$$eval('#screen-settings #ex5-picker', n => n.length), 1);
  const opts = await page.$$eval('#ex5-picker .seg__btn', bs => bs.map(x => ({
    tag: x.querySelector('.seg__tag').textContent,
    label: x.querySelector('.seg__label').textContent,
    sub: x.querySelector('.seg__sub').textContent,
    on: x.getAttribute('aria-pressed')
  })));
  check('chart 1 offers three options', opts.length, 3);
  check('stationary is first and selected', `${opts[0].label}|${opts[0].on}`, 'Stationary run|true');
  check('stationary tagged as printed', opts[0].tag, 'As printed');
  check('alternatives tagged substitution', `${opts[1].tag}|${opts[2].tag}`, 'Substitution|Substitution');
  check('stationary sub shows steps + jumps', opts[0].sub, '100 steps · every 75, 10 scissor jumps');
  check('chart 1 run is the half mile', `${opts[1].label} ${opts[1].sub}`, '½ mile run in 8 min');
  check('chart 1 walk is one mile', `${opts[2].label} ${opts[2].sub}`, '1 mile walk in 21 min');
  const hint0 = await page.textContent('#ex5-note');
  check('hint names the chart alternatives', hint0.includes('½ mile run') && hint0.includes('1 mile walk'), 'true');
  check('hint silent about metronome when not substituted', hint0.includes('metronome'), 'false');

  console.log('--- choosing a substitution ---');
  await page.click('#ex5-picker .seg__btn:nth-child(2)');
  check('mode persisted', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fivebx.prefs.v1')).ex5Mode), 'run');
  const hint1 = await page.textContent('#ex5-note');
  check('hint explains the metronome goes quiet', hint1.includes('metronome, step count and jump prompts'), 'true');
  await backHome(page);
  check('today chip appears', await page.textContent('#today-sub'), 'Exercise 5: ½ mile runUndo');
  check('targets show the substitution', (await page.$$eval('#targets .t-reps', n => n.map(x => x.textContent.trim())))[4], '½ mile run');
  check('total line drops the 11 minute claim', (await page.textContent('#total-line')).replace(/\s+/g, ' '), '5 exercises · 13 minutes');

  console.log('--- workout honours it, metronome stays off ---');
  await settings(page);
  await page.click('#set-metro');
  await backHome(page);
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  for (let i = 0; i < 4; i++) {
    await page.click('#btn-next'); await page.waitForTimeout(160);
    await page.click('#ready'); await page.waitForTimeout(120);
  }
  check('ex5 target is the run', await page.textContent('#target-big'), '½ mile run');
  check('ex5 uses the run allotment', await page.textContent('#clock'), '8:00');
  check('metronome not running for a substitution', await page.evaluate(() => window.__metro.timer === null || window.__metro.timer === undefined), 'true');
  await page.click('#btn-quit');
  await page.waitForSelector('#sheet:not([hidden])');
  page.once('dialog', d => d.accept());
  await page.click('#sheet-discard');
  await page.waitForSelector('#screen-home:not([hidden])');

  console.log('--- undo from Today ---');
  await page.click('#today-sub .subchip__undo');
  await page.waitForTimeout(120);
  check('undo restores stationary', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fivebx.prefs.v1')).ex5Mode), 'stationary');
  check('chip hidden again', await page.evaluate(() => document.getElementById('today-sub').hidden), 'true');
  check('targets back to steps', (await page.$$eval('#targets .t-reps', n => n.map(x => x.textContent.trim())))[4], '100 steps');
  check('total line back to 11 minutes', (await page.textContent('#total-line')).replace(/\s+/g, ' '), '5 exercises · 11 minutes');

  console.log('--- the walk disappears above chart 4 ---');
  await settings(page);
  await page.click('#ex5-picker .seg__btn:nth-child(3)');   // walk
  await backHome(page);
  await setLevel(page, 5, 'D-');
  check('invalid substitution falls back', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fivebx.prefs.v1')).ex5Mode), 'stationary');
  await settings(page);
  const c5 = await page.$$eval('#ex5-picker .seg__btn .seg__label', n => n.map(x => x.textContent));
  check('chart 5 offers two options', c5.join('|'), 'Stationary run|1 mile run');
  check('chart 5 hint explains the missing walk',
    (await page.textContent('#ex5-note')).includes('From Chart 5 the booklet drops the walk'), 'true');
  await backHome(page);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
