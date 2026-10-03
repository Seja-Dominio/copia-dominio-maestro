const CORE_ENTITIES = new Set(['Project', 'Job', 'Subtask', 'FinancialEntry', 'JobHistory']);

export function resolveMaestroDataEndpoint({ entity, operation = 'list' } = {}) {
  if (!CORE_ENTITIES.has(String(entity || ''))) return 'maestro-data';

  const supportedOperation = ['list', 'filter'].includes(operation)
    || ['Project', 'Job', 'Subtask', 'FinancialEntry'].includes(entity)
      && ['create', 'update', 'delete'].includes(operation)
    || entity === 'JobHistory' && operation === 'create'
    || entity === 'FinancialEntry' && operation === 'bulkCreate';

  return supportedOperation ? 'maestro-core-data' : 'maestro-data';
}
