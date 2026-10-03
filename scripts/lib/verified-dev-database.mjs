const protectedProductionRefs = new Set([
  'tqmfuskvllpqmvayjuqu',
  'fwpisypiiezjhtqxlmqv',
]);

export function extractDatabaseProjectRef(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('SUPABASE_DEV_DB_URL must be a valid PostgreSQL URL.');
  }
  return url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1]
    || decodeURIComponent(url.username).split('.').at(-1);
}

export function assertConfirmedDevDatabaseTarget(connectionString, confirmedDevRef) {
  if (!confirmedDevRef || !/^[a-z0-9]{20}$/i.test(confirmedDevRef)) {
    throw new Error('Remote Dev audit is disabled until SUPABASE_CONFIRMED_DEV_PROJECT_REF is verified in Supabase Dashboard.');
  }

  const expectedRef = confirmedDevRef.toLowerCase();
  const actualRef = extractDatabaseProjectRef(connectionString);
  if (protectedProductionRefs.has(expectedRef) || protectedProductionRefs.has(actualRef)) {
    throw new Error('Remote Dev audit refused: the selected project is protected as Production.');
  }
  if (actualRef?.toLowerCase() !== expectedRef) {
    throw new Error('SUPABASE_DEV_DB_URL does not match the confirmed Dev project ref.');
  }
  return expectedRef;
}

export function assertConfirmedProductionDatabaseSource(connectionString, confirmedProductionRef) {
  if (!confirmedProductionRef || !/^[a-z0-9]{20}$/i.test(confirmedProductionRef)) {
    throw new Error('Production reads are disabled until SUPABASE_CONFIRMED_PROD_PROJECT_REF is explicitly verified.');
  }

  const expectedRef = confirmedProductionRef.toLowerCase();
  const actualRef = extractDatabaseProjectRef(connectionString)?.toLowerCase();
  if (!protectedProductionRefs.has(expectedRef) || actualRef !== expectedRef) {
    throw new Error('Production source URL does not match a confirmed protected Production ref.');
  }
  return expectedRef;
}
