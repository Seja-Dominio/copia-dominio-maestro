import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMaestroSupabaseTarget } from '../../src/lib/maestro-environment.mjs';

const isolatedDevRef = 'icwmnobokxuqrtovayri';

test('development and test require a confirmed ref that matches the URL', () => {
  const url = `https://${isolatedDevRef}.supabase.co`;
  assert.equal(resolveMaestroSupabaseTarget({ environment: 'development', url, expectedDevProjectRef: isolatedDevRef }).safe, true);
  assert.equal(resolveMaestroSupabaseTarget({ environment: 'test', url, expectedDevProjectRef: isolatedDevRef }).safe, true);
  assert.equal(resolveMaestroSupabaseTarget({ environment: 'development', url, expectedDevProjectRef: '' }).safe, false);
  assert.equal(resolveMaestroSupabaseTarget({ environment: 'development', url, expectedDevProjectRef: 'abcdefghijklmnopqrst' }).safe, false);
});

test('development and test refuse both refs currently protected as Production', () => {
  for (const ref of ['tqmfuskvllpqmvayjuqu', 'fwpisypiiezjhtqxlmqv']) {
    const url = `https://${ref}.supabase.co`;
    assert.equal(resolveMaestroSupabaseTarget({ environment: 'development', url, expectedDevProjectRef: ref }).safe, false);
    assert.equal(resolveMaestroSupabaseTarget({ environment: 'test', url, expectedDevProjectRef: ref }).safe, false);
  }
});

test('production continues to accept only its existing exact endpoint', () => {
  assert.equal(resolveMaestroSupabaseTarget({
    environment: 'production',
    url: 'https://fwpisypiiezjhtqxlmqv.supabase.co',
  }).safe, true);
  assert.equal(resolveMaestroSupabaseTarget({
    environment: 'production',
    url: 'https://tqmfuskvllpqmvayjuqu.supabase.co',
  }).safe, false);
});
