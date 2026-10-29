import test from 'node:test';
import assert from 'node:assert/strict';
import { presentResourceSources } from '../../../server/modules/resources/source-presentation.mjs';

test('resource sources use saved names and readable categories without exposing raw identities', () => {
  const result = presentResourceSources([
    { id: 'f'.repeat(64), platform: 'math', account_ref: '', metadata: { scope: 'public' } },
    { id: 'a'.repeat(64), platform: 'computer', account_ref: 'raw-account-reference', metadata: { scope: 'account', nickname: '  <b>408 教学来源</b>  ' } },
    { id: 'b'.repeat(64), platform: 'computer', account_ref: 'another-reference', metadata: { scope: 'volatile' } },
  ]);
  assert.deepEqual(result.map(source => source.label), ['考研数学 · 公共资源', '计算机 408 · 408 教学来源', '计算机 408 · 短效资源']);
  assert.equal(result[1].accountRef, 'raw-account-reference', 'raw provenance remains available to technical details');
  for (const source of result) assert.ok(!source.label.includes(source.id) && (!source.accountRef || !source.label.includes(source.accountRef)));
});

test('same-name source numbers are consistent between directory and details regardless of query order', () => {
  const rows = ['b', 'a', 'c'].map(id => ({ id, platform: 'math', account_ref: '', metadata: { scope: 'public' }, count: 2 }));
  const labels = rows => Object.fromEntries(presentResourceSources(rows).map(source => [source.id, source.label]));
  assert.deepEqual(labels(rows), labels(rows.slice().reverse()));
  assert.equal(labels(rows).a, '考研数学 · 公共资源 · 来源 1');
  assert.equal(labels(rows).c, '考研数学 · 公共资源 · 来源 3');
});
