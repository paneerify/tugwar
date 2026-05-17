const runtimeFirebaseConfig = globalThis.__TUGWAR_FIREBASE__ || {};

export const firebaseConfig = {
  apiKey: runtimeFirebaseConfig.apiKey || '',
  authDomain: runtimeFirebaseConfig.authDomain || '',
  databaseURL: runtimeFirebaseConfig.databaseURL || '',
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