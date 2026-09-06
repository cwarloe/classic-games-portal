/* Runs every 5BX suite against a freshly started server.

   npm test                     everything
   npm test -- 04 07            only suites whose filename starts with those
   BASE_URL=... npm test        against an already-running copy (no server started)

   Each suite is a separate process, so one crashing cannot take the rest with
   it, and a suite can always be run on its own with plain node. */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');
const PORT = process.env.PORT || 8080;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}/5bx/`;
const OWN_SERVER = !process.env.BASE_URL;

const only = process.argv.slice(2);
const suites = fs.readdirSync(HERE)
  .filter(f => /^\d\d-.*\.js$/.test(f))
  .filter(f => !only.length || only.some(o => f.startsWith(o)))
  .sort();

function wait(url, tries) {
  return new Promise((resolve, reject) => {
    const go = n => http.get(url, r => { r.resume(); resolve(r.statusCode); })
      .on('error', e => n <= 0 ? reject(e) : setTimeout(() => go(n - 1), 300));
    go(tries);
  });
}

function run(cmd, args, opts) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, Object.assign({ stdio: 'inherit' }, opts));
    p.on('close', code => resolve(code));
  });
}

(async () => {
  if (!suites.length) {
    console.error(only.length ? `No suite matches: ${only.join(', ')}` : 'No suites found.');
    process.exit(1);
  }

  let server = null;
  if (OWN_SERVER) {
    server = spawn('node', ['server.js'], { cwd: ROOT, stdio: 'ignore', env: process.env });
    try {
      await wait(BASE, 25);
    } catch (e) {
      server.kill();
      console.error(`Could not reach ${BASE} — is something else on port ${PORT}?`);
      process.exit(1);
    }
  }
  console.log(`5BX tests — ${suites.length} suite(s) against ${BASE}\n`);

  const results = [];
  for (const s of suites) {
    console.log(`\n${'='.repeat(58)}\n${s}\n${'='.repeat(58)}`);
    const code = await run(process.execPath, [path.join(HERE, s)],
      { cwd: HERE, env: Object.assign({}, process.env, { BASE_URL: BASE }) });
    results.push([s, code]);
  }

  if (server) server.kill();

  const failed = results.filter(r => r[1] !== 0);
  console.log(`\n${'='.repeat(58)}`);
  results.forEach(([s, c]) => console.log(`${c === 0 ? 'PASS' : 'FAIL'}  ${s}`));
  console.log(`${results.length - failed.length}/${results.length} suites passed`);
  process.exit(failed.length ? 1 : 0);
})();
