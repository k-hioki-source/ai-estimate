// Run the actual route handlers with a local in-memory database and synthetic images.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const sharp = require('sharp');

const env = { ESTIMATE_REVIEWS_ENABLED: '1', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key' };
const rows = new Map();
const db = {
  from(table) {
    assert.equal(table, 'estimate_reviews');
    let filters = [];
    let changes;
    const query = {
      insert(record) {
        if (rows.has(record.id)) return { error: { code: '23505' } };
        rows.set(record.id, { ...record, status: 'pending', admin_comment: '' });
        return { error: null };
      },
      select() { return query; },
      update(record) { changes = record; return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      maybeSingle() {
        const record = [...rows.values()].find((row) => filters.every(([key, value]) => row[key] === value));
        if (record && changes) Object.assign(record, changes);
        return { data: record ?? null, error: null };
      },
    };
    return query;
  },
};

function load(file, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  vm.runInNewContext(outputText, {
    exports, Buffer, File, Response, Uint8Array, console, process: { env },
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'next/server') return { NextResponse: Response };
      return dependencies[name.split('/').at(-1)] ?? require(name);
    },
  }, { filename: file });
  return exports;
}

async function run() {
  const tokens = load('lib/estimate-review-token.ts');
  const auth = {
    adminClient: () => db,
    requireAdmin: async (header) => header === 'Bearer synthetic-admin' ? { db } : null,
  };
  const display = load('lib/estimate-review-display.ts');
  const dependencies = {
    'estimate-review-token': tokens,
    'google-calendar-auth': auth,
    'estimate-review-display': display,
  };
  const { POST } = load('app/api/estimate-reviews/route.ts', dependencies);
  const { PATCH } = load('app/api/admin/estimate-reviews/route.ts', dependencies);
  const { GET } = load('app/api/estimate-reviews/[id]/image/route.ts', dependencies);
  const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: 'white' } }).png().toBuffer();
  const snapshot = { amount: 12000, price_type: 'estimate', style: 'line', quantity: 2, unit_hours: 2 };
  const ticket = tokens.issueEstimateReviewTicket(bytes.toString('base64'), snapshot);
  const { id } = tokens.readEstimateReviewTicket(ticket);
  const form = new FormData();
  form.set('ticket', ticket);
  form.set('rating', '4');
  form.set('image', new File([bytes], 'test.png'));
  form.set('amount', '1');
  form.set('admin_comment', 'visitor text');
  const post = () => POST({ formData: async () => form });
  assert.equal((await post()).status, 400, 'consent is required');
  form.set('consentVersion', '1');
  form.set('rating', '6');
  assert.equal((await post()).status, 400, 'rating must be between 1 and 5');
  form.set('rating', '4');
  form.set('ticket', ticket + 'a');
  assert.equal((await post()).status, 400, 'tampered ticket is rejected');
  form.set('ticket', ticket);
  form.set('image', new File(['different bytes'], 'test.png'));
  assert.equal((await post()).status, 400, 'the image must match the estimate');
  form.set('image', new File([bytes], 'test.png'));
  assert.equal((await post()).status, 201);
  assert.equal((await post()).status, 200);
  assert.equal(rows.size, 1, 'retry does not duplicate the review');
  assert.equal(rows.get(id).amount, 12000);
  assert.equal(rows.get(id).admin_comment, '');

  const image = (token) => GET({ headers: new Headers(token ? { Authorization: token } : {}) }, {
    params: Promise.resolve({ id }),
  });
  const update = (status, token) => PATCH({
    headers: new Headers(token ? { Authorization: token } : {}),
    json: async () => ({ id, status, admin_comment: '管理者コメント' }),
  });
  assert.equal((await image()).status, 404, 'pending images are private');
  assert.equal((await image('Bearer synthetic-admin')).status, 200);
  assert.equal((await update('published')).status, 403, 'visitors cannot publish or comment');
  assert.equal((await update('published', 'Bearer synthetic-admin')).status, 200);
  assert.equal(rows.get(id).admin_comment, '管理者コメント');
  const published = await image();
  assert.equal(published.status, 200);
  assert.equal(published.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(published.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await update('hidden', 'Bearer synthetic-admin')).status, 200);
  assert.equal((await image()).status, 404, 'hidden images are private again');
  console.log('Estimate review consent, integrity, duplicate handling, moderation and image access checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
