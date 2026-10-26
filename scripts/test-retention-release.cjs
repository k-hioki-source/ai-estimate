// Release-scope guard: no network, credentials, DB or Storage operations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = 'app/api/cs-works/file-retention';
const expected = ['deletion-logs', 'deletion-plan', 'hold', 'manual-preflight', 'preview'];
assert.deepEqual(fs.readdirSync(root).sort(), expected);
for (const name of expected) {
  const source = fs.readFileSync(path.join(root, name, 'route.ts'), 'utf8');
  assert.doesNotMatch(source, /\.(?:delete|remove|insert|update|rpc)\s*\(/, name + ': forbidden mutation');
  assert.doesNotMatch(source, /(?:resend|sendEmail|fetch)\s*\(/, name + ': unexpected external action');
  if (name !== 'hold') assert.doesNotMatch(source, /\.upsert\s*\(/, name + ': read-only route');
}
const hold = fs.readFileSync(path.join(root, 'hold/route.ts'), 'utf8');
assert.match(hold, /from\('project_file_retention_holds'\)\.upsert\(/);
assert.equal((hold.match(/\.upsert\(/g) || []).length, 1);
assert.equal(fs.existsSync('app/admin/file-retention/tests'), false);
const page = fs.readFileSync('app/admin/file-retention/page.tsx', 'utf8');
assert.doesNotMatch(page, /isTestPage|mockPlan|RecoveryFixture|recovery-|fixture|test-email|storage-probe/);
const calls = [...page.matchAll(/fetch\('\/api\/cs-works\/file-retention\/([^']+)'/g)].map(m => m[1]);
assert.deepEqual([...new Set(calls)].sort(), expected);
const crons = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).crons;
assert.deepEqual(crons, [{ path: '/api/cs-works/payment-reminder', schedule: '0 0 * * *' }]);
console.log('Release scope verified: five retention routes, hold-only writes, no test UI/routes or retention cron; payment reminder preserved.');
