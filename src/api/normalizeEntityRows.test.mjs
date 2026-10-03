import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntityRows } from './normalizeEntityRows.js';

test('unwraps legacy record payload and preserves identifiers and timestamps', () => {
  assert.deepEqual(normalizeEntityRows([{ record_id: 'project-1', payload: { name: 'Projeto' }, source_created_at: 'created', source_updated_at: 'updated' }]), [
    { name: 'Projeto', id: 'project-1', created_at: 'created', created_date: 'created', updated_date: 'updated' },
  ]);
});

test('leaves already normalized records unchanged', () => {
  const rows = [{ id: 'job-1', title: 'Job' }];
  assert.deepEqual(normalizeEntityRows(rows), rows);
});
