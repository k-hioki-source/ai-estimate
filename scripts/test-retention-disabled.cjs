// Execute historical mutation handlers with dependencies that fail on external access.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const names = ['claim-test','linkage-lifecycle-test','recovery-fixture','recovery-fixture-cleanup','recovery-stage','recovery-state-test','storage-probe','storage-probe-cleanup','storage-test','test-email','recovery-stage-execute','recovery-stage-finalize-execute'];
(async () => {
  let checks = 0;
  for (const env of ['production','preview']) {
    for (const name of names) {
      const exports = {};
      const source = fs.readFileSync(`app/api/cs-works/file-retention/${name}/route.ts`, 'utf8');
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
      const forbidden = () => { throw Error('Unexpected external dependency access'); };
      vm.runInNewContext(code, { exports, process: { env: { VERCEL_ENV: env, CSWORKS_ENABLE_TEST_FIXTURE_CLEANUP: 'true', CSWORKS_ENABLE_TEST_FIXTURE_FINALIZE: 'true' } },
        require: id => id === 'next/server' ? { NextResponse: { json: (body, options) => ({ body, ...options }) } } : id === '@supabase/supabase-js' ? { createClient: forbidden } : id === 'resend' ? { Resend: forbidden } : require(id), console });
      const result = await exports.POST(new Proxy({}, { get: forbidden }));
      assert.equal(result.status, 403, `${env}/${name}`);
      assert.equal(result.headers['Cache-Control'], 'no-store, private');
      checks++;
    }
  }
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert(config.crons.some(x => x.path === '/api/cs-works/payment-reminder'));
  assert(!config.crons.some(x => x.path.includes('/file-retention/')));
  assert(fs.readFileSync('app/api/cs-works/file-retention/cron/route.ts','utf8').includes('const sendEnabled = false;'));
  console.log(`${checks} API denial checks passed; retention cron removed; payment reminder preserved.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
