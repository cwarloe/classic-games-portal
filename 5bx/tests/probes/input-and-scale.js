/* PROBE, not a test. These report what the app actually does so a human can
   judge it; they assert nothing and never fail. This is how the integrity
   bugs in 04-integrity.js were found - rerun them after big changes.

   Hostile text in notes, 800 logged sessions, and a full disk.

   node 5bx/tests/probes/input-and-scale.js   (needs a server on :8080, or set BASE_URL) */
const { URL, launch, phone } = require('../harness');
function probe(n, r) { console.log(`  ${n}\n     -> ${r}`); }
(async () => {
  const b = await launch();
  const ctx = await phone(b, 390, 844);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('\n=== E: hostile text in notes (this did NOT run earlier) ===');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify({ chartId: 1, level: 'D-', ex5Mode: 'stationary', seenWelcome: true, levelSeen: '1:D-' }));
    localStorage.setItem('fivebx.sessions.v1', JSON.stringify([{
      id: 'x', date: new Date().toISOString(), chartId: 1, level: 'D-', ex5Mode: 'stationary',
      durationSeconds: 650, totalSeconds: 700, completedInTime: true,
      notes: '<img src=x onerror="window.__pwned=1"><script>window.__pwned2=1<\/script>'
    }]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 8000 });
  await page.click('#tabbar .tab[data-tab="history"]');
  await page.waitForSelector('#screen-history:not([hidden])');
  await page.waitForTimeout(400);
  probe('script payload in a note', await page.evaluate(() =>
    'executed=' + (!!window.__pwned || !!window.__pwned2) +
    '; rendered as literal text=' + document.getElementById('log').textContent.includes('<img src=x') +
    '; injected img elements=' + document.querySelectorAll('#log img').length));

  console.log('\n=== L: a lot of history ===');
  await page.evaluate(() => {
    const s = [];
    for (let i = 0; i < 800; i++) { const d = new Date(); d.setDate(d.getDate() - i);
      s.push({ id: 'n' + i, date: d.toISOString(), chartId: 1 + (i % 6),
        level: 'D-', ex5Mode: 'stationary', durationSeconds: 640, totalSeconds: 700,
        completedInTime: true, notes: 'session ' + i }); }
    localStorage.setItem('fivebx.sessions.v1', JSON.stringify(s));
  });
  let t0 = Date.now();
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#screen-splash').catch(() => {});
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 15000 });
  probe('boot with 800 sessions', (Date.now() - t0) + 'ms to Today');
  t0 = Date.now();
  await page.click('#tabbar .tab[data-tab="history"]');
  await page.waitForSelector('#screen-history:not([hidden])');
  await page.waitForTimeout(50);
  probe('open History with 800 sessions', (Date.now() - t0) + 'ms; rows rendered=' +
    await page.evaluate(() => document.querySelectorAll('#log > *').length));

  console.log('\n=== M: storage full ===');
  await page.evaluate(() => {
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) { if (k.indexOf('fivebx') === 0) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig(k, v); };
  });
  await page.click('#tabbar .tab[data-tab="home"]');
  await page.waitForSelector('#screen-home:not([hidden])');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-work:not([hidden])');
  await page.evaluate(() => { for (let i = 0; i < 8; i++) document.getElementById('btn-next').click(); });
  await page.waitForSelector('#screen-done:not([hidden])');
  await page.click('#btn-save');
  await page.waitForTimeout(500);
  probe('saving when storage is full', await page.evaluate(() =>
    'screen=' + (document.getElementById('screen-home').hidden ? 'still on finish' : 'returned to Today') +
    '; any warning shown=' + /could not|failed|full|error/i.test(document.body.textContent)));

  console.log('\n=== errors ===');
  console.log(errs.length ? errs.join('\n') : '(none)');
  await b.close();
})();
