// Uruchom: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

const cat = (name, percent, roi) => ({ id: name, name, isCustom: false, percent, roi });
const plan = (budget, categories) => ({ name: 'Test', year: 2027, totalBudget: budget, categories });

test('AC-01: budżet 100 000, Social media 40% i ROI 150% → kwota 40 000, zwrot netto 60 000', () => {
  const r = C.computePlan(plan(100000, [cat('Social media', 40, 150)]));
  assert.equal(r.rows[0].amount, 40000);
  assert.equal(r.rows[0].net, 60000);
  assert.equal(r.rows[0].gross, 100000);
});

test('AC-03: ROI portfela = (60 000 + 30 000) / 100 000 = 90%', () => {
  const r = C.computePlan(plan(100000, [cat('Social media', 40, 150), cat('Radio', 60, 50)]));
  assert.equal(r.totalNet, 90000);
  assert.equal(C.round(r.portfolioRoi, 6), 90);
});

test('AC-04: zmiana budżetu przelicza kwoty, nie zmienia procentów', () => {
  const p = plan(100000, [cat('Radio', 25, 10)]);
  const before = C.computePlan(p).rows[0];
  p.totalBudget = 200000;
  const after = C.computePlan(p).rows[0];
  assert.equal(before.percent, after.percent);
  assert.equal(before.amount, 25000);
  assert.equal(after.amount, 50000);
});

test('AC-02: suma 105% blokuje zapis i podaje różnicę 5 p.p.', () => {
  const errors = C.validatePlan(plan(100000, [cat('A', 60, 0), cat('B', 45, 0)]));
  const sum = errors.find((e) => e.field === 'sum');
  assert.ok(sum, 'powinien być błąd sumy');
  assert.match(sum.message, /5 p\.p\./);
});

test('suma 100% jest poprawna, a rezerwa wynosi 0', () => {
  const p = plan(100000, [cat('A', 60, 0), cat('B', 40, 0)]);
  assert.deepEqual(C.validatePlan(p), []);
  assert.equal(C.computePlan(p).reserveAmount, 0);
});

test('FR-10: niezaalokowana część to rezerwa, bez blokowania zapisu', () => {
  const p = plan(100000, [cat('A', 30, 0)]);
  assert.deepEqual(C.validatePlan(p), []);
  const r = C.computePlan(p);
  assert.equal(r.reservePercent, 70);
  assert.equal(r.reserveAmount, 70000);
});

test('ROI ujemny jest oznaczony (AC-06)', () => {
  const r = C.computePlan(plan(1000, [cat('Telewizja', 50, -20)]));
  assert.equal(r.rows[0].negative, true);
  assert.equal(r.rows[0].net, -100);
});

test('ROI spoza zakresu −100…1000% jest błędem walidacji', () => {
  const errors = C.validatePlan(plan(1000, [cat('X', 10, 1500)]));
  assert.ok(errors.some((e) => e.field === 'roi:X'));
});

test('budżet 0 lub powyżej maksimum jest odrzucany (FR-02)', () => {
  assert.ok(C.validatePlan(plan(0, [])).some((e) => e.field === 'totalBudget'));
  assert.ok(C.validatePlan(plan(1e9, [])).some((e) => e.field === 'totalBudget'));
});

test('limit 20 własnych kategorii (FR-04)', () => {
  const cats = Array.from({ length: 21 }, (_, i) => ({ ...cat('C' + i, 0, 0), isCustom: true }));
  assert.ok(C.validatePlan(plan(1000, cats)).some((e) => e.field === 'categories'));
});

test('scenariusze: optymistyczny poprawia także ROI ujemny', () => {
  assert.ok(C.effectiveRoi(-20, 0.3) > -20);
  assert.equal(C.effectiveRoi(100, 0.3), 130);
  assert.equal(C.effectiveRoi(100, -0.3), 70);
});

test('udział w zwrocie sumuje się do 100%', () => {
  const r = C.computePlan(plan(100000, [cat('A', 40, 150), cat('B', 60, 50)]));
  const total = r.rows.reduce((s, x) => s + x.shareOfNet, 0);
  assert.equal(C.round(total, 6), 100);
});

test('duplikat planu dostaje nowe id i nową nazwę (FR-23)', () => {
  const original = C.createPlan({ name: 'Plan 2026' });
  const copy = C.duplicatePlan(original, 2027);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, 'Plan 2026 (kopia)');
  assert.equal(copy.year, 2027);
  copy.categories.forEach((c, i) => assert.notEqual(c.id, original.categories[i].id));
});
