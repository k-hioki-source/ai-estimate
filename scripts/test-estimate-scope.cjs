const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => load(path.resolve(path.dirname(file), name + '.ts')) }, { filename: file });
  cache.set(file, exports); return exports;
}
const { isSideAndDetailPair, hasRequestedAngleChange, priceEstimateHours } = load('lib/estimateScope.ts');
const { calculateMasterEstimate, calculateIntegratedEstimate } = load('lib/estimateMaster.ts');
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
const input = {sourceType:'photo_trace',usage:'manual',style:'line',quantity:2,notes:'側面図と部分拡大図の2点',workType:'standard_trace',difficultyScore:40,partDensity:30,lineDifficulty:35,structureComplexity:30,aiSummary:''};
test('explicit pair recognized', () => assert.ok(isSideAndDetailPair(input.notes, 2, 'line')));
for (const [notes, quantity, style] of [['側面図を2点',2,'line'],['部分拡大図を2点',2,'line'],[input.notes,3,'line'],[input.notes,2,'real'],['側面図と部分拡大図は不要',2,'line'],['同じ側面図と部分拡大図のセット',2,'line']]) test('keep representative scope: '+notes+'/'+quantity+'/'+style, () => assert.equal(isSideAndDetailPair(notes,quantity,style),false));
for (const notes of ['側面図','背面図','別アングルは不要','視点変更は必要ない']) test('no angle surcharge: '+notes, () => assert.equal(hasRequestedAngleChange(notes),false));
for (const notes of ['別アングルで作図してください','写真にない側面を作図','角度を変えて描いてください']) test('explicit angle: '+notes, () => assert.equal(hasRequestedAngleChange(notes),true));
test('pair master adds detail exactly once without angle', () => { const r=calculateMasterEstimate(input); assert.equal(r.baseHours,1.5); assert.equal(r.hours,3.5); assert.equal(r.adjustments.length,1); assert.equal(r.adjustments[0].key,'detail'); });
test('negated angle does not select new-state category', () => assert.notEqual(calculateMasterEstimate({...input,notes:'側面図と部分拡大図。別アングルは不要です'}).categoryKey,'new_state'));
test('AI explanation cannot invent requested angle', () => {const r=calculateMasterEstimate({...input,aiSummary:'別アングルの側面図を制作します'});assert.equal(r.adjustments.some(a=>a.key==='angle'),false)});
test('same illustrations preserve hours times quantity', () => {const r=priceEstimateHours(3*2,2,3000);assert.equal(r.totalPrice,18000);assert.equal(r.unitHours,3)});
for(const hours of [3,3.5,6,12]) test('combined total priced once at '+hours+'h', () => {const r=priceEstimateHours(hours,2,3000);assert.equal(r.totalPrice,hours*3000);assert.equal(r.unitHours*2,hours);assert.equal(r.unitPrice*2,r.totalPrice)});
test('integrated simple pair remains variable, not fixed to 9000', () => {const master=calculateMasterEstimate(input);const r=calculateIntegratedEstimate({systemHours:1+2,aiHours:3,masterHours:master.hours,masterMatchScore:master.matchScore});assert.equal(r.hours,3.5);assert.equal(priceEstimateHours(r.hours,2,3000).totalPrice,10500)});
test('complex visual scores can raise combined quote above 10000', () => {const master=calculateMasterEstimate({...input,difficultyScore:80,partDensity:80,lineDifficulty:80,structureComplexity:80});const r=calculateIntegratedEstimate({systemHours:8,aiHours:9,masterHours:master.hours,masterMatchScore:master.matchScore});assert.ok(priceEstimateHours(r.hours,2,3000).totalPrice>10500)});
console.log(count+' checks passed');
