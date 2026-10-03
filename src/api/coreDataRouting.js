const CORE_DATA_ENTITIES = new Set([
  'Project',
  'Job',
  'Subtask',
  'FinancialEntry',
  'JobHistory',
]);

const RELATIONAL_READ_ENTITIES = new Set([
  'Project',
  'Job',
  'Subtask',
]);

export function getMaestroDataEndpoint(entity) {
  return CORE_DATA_ENTITIES.has(String(entity || ''))
    ? 'maestro-core-data'
    : 'maestro-data';
}

export function getMaestroDataReadSource(entity) {
  return RELATIONAL_READ_ENTITIES.has(String(entity || '')) ? 'relational' : undefined;
}
