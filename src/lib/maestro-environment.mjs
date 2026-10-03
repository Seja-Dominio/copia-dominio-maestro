const PRODUCTION_URL = 'https://fwpisypiiezjhtqxlmqv.supabase.co';
const PROTECTED_PRODUCTION_REFS = new Set([
  'fwpisypiiezjhtqxlmqv',
]);

export function extractSupabaseProjectRef(value) {
  try {
    const { hostname } = new URL(value);
    return hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1]?.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function resolveMaestroSupabaseTarget({ environment, url, expectedDevProjectRef }) {
  const actualRef = extractSupabaseProjectRef(url);

  if (environment === 'production') {
    const safe = typeof url === 'string' && url.replace(/\/$/, '') === PRODUCTION_URL;
    return {
      safe,
      actualRef,
      error: safe ? null : 'A URL configurada não corresponde ao Supabase de produção aprovado.',
    };
  }

  if (environment !== 'development' && environment !== 'test') {
    return { safe: false, actualRef, error: 'Ambiente Maestro desconhecido; nenhuma chamada ao Supabase foi permitida.' };
  }

  const expectedRef = String(expectedDevProjectRef || '').trim().toLowerCase();
  if (!expectedRef || !/^[a-z0-9]{20}$/.test(expectedRef)) {
    return {
      safe: false,
      actualRef,
      error: 'Configure o ref confirmado do Supabase Dev antes de usar o app; nenhuma chamada foi enviada.',
    };
  }
  if (PROTECTED_PRODUCTION_REFS.has(expectedRef) || PROTECTED_PRODUCTION_REFS.has(actualRef)) {
    return {
      safe: false,
      actualRef,
      error: 'Dev/teste está apontando para um projeto protegido como Produção; nenhuma chamada foi enviada.',
    };
  }
  if (actualRef !== expectedRef) {
    return {
      safe: false,
      actualRef,
      error: 'O ref da URL do Supabase não corresponde ao ref Dev confirmado; nenhuma chamada foi enviada.',
    };
  }

  return { safe: true, actualRef, error: null };
}
