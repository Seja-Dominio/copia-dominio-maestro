import test from 'node:test';
import assert from 'node:assert/strict';
import { assertConfirmedDevDatabaseTarget, assertConfirmedProductionDatabaseSource } from './verified-dev-database.mjs';

const isolatedDevRef = 'icwmnobokxuqrtovayri';

test('remote Dev audit fails closed until an independently confirmed ref is supplied', () => {
  const url = `postgresql://postgres.${isolatedDevRef}:placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
  assert.throws(() => assertConfirmedDevDatabaseTarget(url, undefined), /disabled until/);
});

test('remote Dev audit accepts the explicitly confirmed Dev project and rejects Production', () => {
  const devRef = 'tqmfuskvllpqmvayjuqu';
  const devUrl = `postgresql://postgres.${devRef}:placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
  assert.equal(assertConfirmedDevDatabaseTarget(devUrl, devRef), devRef);

  const productionRef = 'fwpisypiiezjhtqxlmqv';
  const productionUrl = `postgresql://postgres.${productionRef}:placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
  assert.throws(() => assertConfirmedDevDatabaseTarget(productionUrl, productionRef), /protected as Production/);
});

test('remote Dev audit accepts only a connection matching the confirmed isolated ref', () => {
  const url = `postgresql://postgres.${isolatedDevRef}:placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
  assert.equal(assertConfirmedDevDatabaseTarget(url, isolatedDevRef), isolatedDevRef);
  assert.throws(() => assertConfirmedDevDatabaseTarget(url, 'abcdefghijklmnopqrst'), /does not match/);
});

test('production source reads require an explicit matching confirmation', () => {
  const ref = 'fwpisypiiezjhtqxlmqv';
  const url = `postgresql://postgres.${ref}:placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
  assert.throws(() => assertConfirmedProductionDatabaseSource(url, undefined), /disabled until/);
  assert.throws(() => assertConfirmedProductionDatabaseSource(url, isolatedDevRef), /does not match/);
  assert.equal(assertConfirmedProductionDatabaseSource(url, ref), ref);
});
