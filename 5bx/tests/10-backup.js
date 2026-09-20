/* Backup and restore: the only way history survives a new phone, so it has to
   round-trip exactly, refuse junk, and never silently lose anything.

   Run one:  node 5bx/tests/10-backup.js
   Run all:  npm test          (from the repo root) */
const { URL, launch, phone, boot } = require('./harness');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
}
const settings = async page => {
  await page.click('#tabbar .tab[data-tab="settings"]');
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.evaluate(() => { document.getElementById('restore').open = true; });
};
const seed = (page, n, chartId, level) => page.evaluate(([n, chartId, level]) => {
  const s = [];
  for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() - i);
    s.push({ id: 'seed' + i, date: d.toISOString(), chartId, level, ex5Mode: 'stationary',
             durationSeconds: 650, totalSeconds: 700, completedInTime: true, notes: 'n' + i }); }
  localStorage.setItem('fivebx.sessions.v1', JSON.stringify(s));
}, [n, chartId, level]);
const restore = async (page, text, mode, answer) => {
  if (answer !== undefined) page.once('dialog', d => answer ? d.accept() : d.dismiss());
  await page.evaluate(([t, m]) => {
    document.getElementById('restore-text').value = t;
    document.querySelector(`#restore-mode .seg__btn[data-restore="${m}"]`).click();
  }, [text, mode]);
  await page.click('#btn-restore');
  await page.waitForTimeout(250);
  return page.textContent('#restore-result');
};
const count = page => page.evaluate(() =>
  JSON.parse(localStorage.getItem('fivebx.sessions.v1') || '[]').length);

(async () => {
  const b = await launch();
  const ctx = await phone(b);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('--- a backup round-trips ---');
  await boot(page, { chartId: 3, level: 'B', age: 41 });
  await seed(page, 5, 3, 'B');
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])');
  const backup = await page.evaluate(() => JSON.stringify({
    app: '5bx', version: 1, exported: new Date().toISOString(),
    prefs: JSON.parse(localStorage.getItem('fivebx.prefs.v1')),
    sessions: JSON.parse(localStorage.getItem('fivebx.sessions.v1'))
  }, null, 2));
  check('backup carries the sessions', JSON.parse(backup).sessions.length, 5);
  check('backup carries the level', JSON.parse(backup).prefs.chartId + ':' + JSON.parse(backup).prefs.level, '3:B');

  console.log('--- restoring onto a wiped device ---');
  await boot(page, {});                       // fresh install: Chart 1 D-, no history
  check('starts empty', await count(page), 0);
  await settings(page);
  let msg = await restore(page, backup, 'replace');
  check('reports what it restored', /Restored 5 session/.test(msg), 'true');
  check('sessions are back', await count(page), 5);
  check('level is back', await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('fivebx.prefs.v1')); return p.chartId + ':' + p.level; }), '3:B');
  check('age is back', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fivebx.prefs.v1')).age), 41);
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  check('Today shows the restored level', await page.textContent('#today-level'), 'Chart 3 · B');

  console.log('--- merge keeps what is here and dedupes ---');
  await boot(page, { chartId: 3, level: 'B' });
  await seed(page, 3, 3, 'B');                 // seed0..seed2 already present
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])');
  await settings(page);
  msg = await restore(page, backup, 'merge');  // backup has seed0..seed4
  check('adds only what is missing', /Added 2 new session/.test(msg), 'true');
  check('says what was already there', /3 were already here/.test(msg), 'true');
  check('total is the union, not the sum', await count(page), 5);
  check('merging twice changes nothing', await (async () => {
    await restore(page, backup, 'merge'); return count(page); })(), 5);

  console.log('--- it refuses junk instead of destroying data ---');
  await boot(page, {});
  await seed(page, 4, 1, 'D-');
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])');
  await settings(page);
  check('not JSON', /not valid backup text/.test(await restore(page, 'hello there', 'replace')), 'true');
  check('JSON but not a backup', /No sessions found/.test(await restore(page, '{"a":1}', 'replace')), 'true');
  check('empty input', /Choose a file or paste/.test(await restore(page, '', 'replace')), 'true');
  check('nothing was lost through any of that', await count(page), 4);

  console.log('--- unreadable rows are skipped, not fatal ---');
  const mixed = JSON.stringify({ sessions: [
    { id: 'good1', date: new Date().toISOString(), chartId: 1, level: 'D-', completedInTime: true },
    { id: 'bad1', date: 'not a date', chartId: 1, level: 'D-' },
    { id: 'bad2', date: new Date().toISOString(), chartId: 99, level: 'D-' },
    { id: 'bad3', date: new Date().toISOString(), chartId: 1, level: 'ZZZ' },
    'not even an object'
  ]});
  msg = await restore(page, mixed, 'replace', true);
  check('keeps the good row', /Restored 1 session/.test(msg), 'true');
  check('and says how many it skipped', /4 unreadable row\(s\) skipped/.test(msg), 'true');
  check('stored exactly the good one', await count(page), 1);

  console.log('--- declining the replace prompt changes nothing ---');
  await seed(page, 6, 1, 'D-');
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])');
  await settings(page);
  await restore(page, backup, 'replace', false);      // answer "no"
  check('saying no leaves the sessions alone', await count(page), 6);
  await restore(page, backup, 'replace', true);       // then say "yes"
  check('saying yes goes through', await count(page), 5);

  console.log('--- it will not restore over a running workout ---');
  await boot(page, {});
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.click('#btn-quit'); await page.waitForSelector('#sheet:not([hidden])');
  await page.click('#sheet-home'); await page.waitForSelector('#screen-home:not([hidden])');
  await settings(page);
  check('refuses while a workout is open', /Finish or discard the workout/.test(
    await restore(page, backup, 'replace')), 'true');
  check('and changed nothing', await count(page), 0);

  console.log('--- the file download is offered ---');
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#btn-backup');
  const got = await dl;
  check('Save a backup produces a file', got ? 'yes' : 'no', 'yes');
  check('named for today', got ? /^5bx-backup-\d{4}-\d{2}-\d{2}\.json$/.test(got.suggestedFilename()) : false, 'true');

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
