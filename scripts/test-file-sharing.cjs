// Test the real route handlers using in-memory Supabase doubles. No network or real keys.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const now = Date.parse('2026-10-26T00:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
class Reply { constructor(body, options) { Object.assign(this, options); this.body = body; } static json(body, options) { return new Reply(body, options); } static redirect(url, options) { return new Reply({ url }, options); } }
function load(path, state = {}) {
  const writes = [], signs = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: state.invalidUser ? null : { id: state.user || 'owner' } } }) },
    from(table) {
      let op = 'read', value, filters = [];
      const result = () => {
        if (op !== 'read') writes.push({ table, op, value, filters });
        if (table === 'projects') return { data: { id: 'project-a', user_id: 'owner' } };
        if (table === 'profiles') return { data: { role: state.role || 'customer' } };
        if (table === 'project_files') return { data: state.missingFile ? null : { id: 'file-a', project_id: 'project-a', storage_path: 'project-a/file.png', file_type: state.fileType || 'delivery' } };
        if (table === 'project_file_shares') {
          if (op === 'insert') return { data: { id: 'share-a' } };
          if (op === 'update') return { data: [{ id: 'share-a' }] };
          return { data: state.missingShare ? null : { file_id: 'file-a', project_id: 'project-a', expires_at: state.expires || new Date(now + 1).toISOString(), revoked_at: state.revoked ? new Date(now).toISOString() : null }, error: state.queryError ? { code: 'MOCK_FAILURE' } : null };
        }
        throw Error('Unexpected table: ' + table);
      };
      const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, is() { return q; }, gt() { return q; }, order() { return q; }, limit() { return q; }, insert(v) { op='insert';value=v;return q; }, update(v) { op='update';value=v;return q; }, maybeSingle: async () => result(), single: async () => result(), then(resolve,reject) { return Promise.resolve(result()).then(resolve,reject); } };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: async (path, ttl) => { signs.push({path,ttl}); return { data: { signedUrl: 'https://storage.example.test/file' } }; } }) },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Date: Clock, URL, console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mock', SUPABASE_SERVICE_ROLE_KEY: 'mock' } },
    require: id => id === 'next/server' ? { NextResponse: Reply } : id === '@supabase/supabase-js' ? { createClient: () => db } : require(id),
  });
  return { api: exports, writes, signs };
}
const manage = 'app/api/cs-works/file-shares/route.ts';
const access = 'app/api/cs-works/file-share/[token]/route.ts';
const request = (authenticated = true) => ({ headers: { get: () => authenticated ? 'Bearer mock' : null }, url: 'https://preview.example.test/api/cs-works/file-shares?projectId=project-a&fileId=file-a', json: async () => ({ projectId: 'project-a', fileId: 'file-a', shareId: 'share-a' }) });
(async () => {
  let checks = 0;
  for (const state of [{ expires: new Date(now-1).toISOString() }, { expires: new Date(now).toISOString() }, { revoked: true }, { missingShare: true }, { queryError: true }, { missingFile: true }, { fileType: 'reference' }]) {
    const h = load(access,state);
    const r = await h.api.GET(request(false), { params: Promise.resolve({token:'a'.repeat(43)}) });
    assert.equal(r.status,404); assert.equal(h.signs.length,0); assert.equal(h.writes.length,0); checks++;
  }
  const live = load(access);
  assert.equal((await live.api.GET(request(false),{params:Promise.resolve({token:'a'.repeat(43)})})).status,302);
  assert.equal(live.signs[0].ttl,60); checks++;
  for (const method of ['GET','POST','DELETE']) {
    const h = load(manage,{user:'other-customer'});
    assert.equal((await h.api[method](request())).status,403);
    assert.equal(h.writes.length,0); assert.equal(h.signs.length,0); checks++;
    const unauth = load(manage);
    assert.equal((await unauth.api[method](request(false))).status,401); assert.equal(unauth.writes.length,0); checks++;
  }
  for (const state of [{user:'owner'},{user:'administrator',role:'admin'}]) {
    const h=load(manage,state);const r=await h.api.POST(request());assert.equal(r.status,200);
    assert.equal(Date.parse(r.body.expiresAt)-now,7*86400000);
    const token=r.body.url.split('/').pop();const record=h.writes[0].value;
    assert.notEqual(record.token_hash,token);assert.equal(record.token_hash,require('node:crypto').createHash('sha256').update(token).digest('hex'));checks++;
  }
  console.log(`${checks} sharing checks passed (mock-only): expiry boundaries, revocation, cross-customer denial, authentication, exact 7-day issuance and token hashing.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
