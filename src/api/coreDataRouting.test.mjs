import test from 'node:test';
import assert from 'node:assert/strict';
import { getMaestroDataEndpoint, getMaestroDataReadSource } from './coreDataRouting.js';

test('routes only cutover core entities through the isolated core endpoint', () => {
  for (const entity of ['Project', 'Job', 'Subtask', 'FinancialEntry', 'JobHistory']) {
    assert.equal(getMaestroDataEndpoint(entity), 'maestro-core-data');
  }
});

test('leaves other products on their existing endpoint, including CXM entities', () => {
  for (const entity of ['Client', 'CXMContact', 'WhatsappContact', 'Proposal', 'Notification']) {
    assert.equal(getMaestroDataEndpoint(entity), 'maestro-data');
  }
});

test('reads frozen project, job, and subtask records from their relational source', () => {
  for (const entity of ['Project', 'Job', 'Subtask']) {
    assert.equal(getMaestroDataReadSource(entity), 'relational');
  }
});

test('does not change read-source behavior for other core entities or CXM', () => {
  for (const entity of ['FinancialEntry', 'JobHistory', 'Client', 'CXMContact']) {
    assert.equal(getMaestroDataReadSource(entity), undefined);
  }
});
