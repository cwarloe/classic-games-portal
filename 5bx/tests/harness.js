/* Shared bits for the 5BX test suites.
   Every suite is a standalone Node script: `node 5bx/tests/01-core.js` runs one,
   `npm test` runs them all. Only the things that differ between machines live
   here, so a suite never hard-codes a path or a port. */

const { chromium } = require('playwright');
const fs = require('fs');

/* Where the app is served. run.js starts the repo's own server on this port;
   point BASE_URL elsewhere to test a deployed copy. */
const URL = process.env.BASE_URL || 'http://localhost:8080/5bx/';

/* Some sandboxes ship a pinned Chromium instead of Playwright's own download.
   Use it when it is there, otherwise let Playwright find the browser it
   installed (`npx playwright install chromium`). */
const PINNED = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function launch() {
  const opts = { args: ['--autoplay-policy=no-user-gesture-required'] };
  if (fs.existsSync(PINNED)) opts.executablePath = PINNED;
  try {
    return await chromium.launch(opts);
  } catch (e) {
    throw new Error('Could not start Chromium. Run `npx playwright install chromium`, ' +
                    'or set CHROMIUM_PATH to a browser binary.\n' + e.message);
  }
}

/* A phone-shaped context, which is the only shape this app is designed for. */
function phone(browser, width, height) {
  return browser.newContext({
    viewport: { width: width || 390, height: height || 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
}

/* Tiny reporter. Suites print their own section headings and call check(). */
function reporter() {
  let pass = 0, fail = 0;
  const errs = [];
  return {
    check(name, got, want) {
      const ok = String(got) === String(want);
      ok ? pass++ : fail++;
      console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}: ${got}${ok ? '' : `   (expected ${want})`}`);
    },
    watch(page) {                       // console errors are failures worth seeing
      page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    },
    done() {
      console.log(`\n${pass} passed, ${fail} failed`);
      console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : 'No console errors.');
      return fail === 0 && errs.length === 0 ? 0 : 1;
    }
  };
}

/* The start screen waits for a tap, so every load goes through it. */
async function land(page) {
  if (!(await page.evaluate(() => document.getElementById('screen-splash').hidden))) {
    await page.click('#screen-splash');
  }
  await page.waitForSelector('#screen-home:not([hidden])', { timeout: 10000 });
}

/* Boot with a known state, skipping the welcome. */
async function boot(page, prefs) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(p => {
    localStorage.clear();
    localStorage.setItem('fivebx.prefs.v1', JSON.stringify(Object.assign({
      chartId: 1, level: 'D-', ex5Mode: 'stationary', age: null,
      seenWelcome: true, levelSeen: '1:D-'
    }, p || {})));
  }, prefs);
  await page.reload({ waitUntil: 'networkidle' });
  await land(page);
}

module.exports = { URL, launch, phone, reporter, land, boot };
