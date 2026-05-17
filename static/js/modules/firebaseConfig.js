const runtimeFirebaseConfig = globalThis.__TUGWAR_FIREBASE__ || {};

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  const trimmed = String(rawUrl).trim().replace(/^['"]|['"]$/g, '');

  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}/`;
  } catch {
    return trimmed;
  }
}

export const normalizedDatabaseUrl = normalizeDatabaseUrl(runtimeFirebaseConfig.databaseURL || '');

export const firebaseConfig = {
  apiKey: runtimeFirebaseConfig.apiKey || '',
  authDomain: runtimeFirebaseConfig.authDomain || '',
  databaseURL: normalizedDatabaseUrl,
  projectId: runtimeFirebaseConfig.projectId || '',
  appId: runtimeFirebaseConfig.appId || ''
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.databaseURL &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);