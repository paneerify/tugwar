import { firebaseConfig, isFirebaseConfigured, normalizedDatabaseUrl } from './firebaseConfig.js';

const LOCAL_LOBBY_STORAGE_KEY = 'tugwar-diff-lobby-v1';
const LOCAL_SESSION_PREFIX = 'tugwar-session-';
const LOBBY_STALE_MS = 1000 * 60 * 60 * 4;

let firebaseApiPromise = null;
let localListeners = [];

function normalizeLobbyState(rawState) {
  const lobbyState = rawState && Array.isArray(rawState.teams) ? rawState : { teams: [] };
  const cutoff = Date.now() - LOBBY_STALE_MS;
  lobbyState.teams = lobbyState.teams.filter((team) => team && team.updatedAt && team.updatedAt >= cutoff);
  return lobbyState;
}

function teamArrayToMap(teams) {
  return teams.reduce((accumulator, team) => {
    accumulator[team.id] = team;
    return accumulator;
  }, {});
}

function mapToLobbyState(teamMap) {
  return normalizeLobbyState({ teams: Object.values(teamMap || {}) });
}

function normalizeSessionState(rawState, sessionId) {
  return {
    sessionId,
    status: rawState?.status || 'setup',
    hostOwnerId: rawState?.hostOwnerId || null,
    updatedAt: rawState?.updatedAt || Date.now(),
    teams: {
      0: rawState?.teams?.[0] || rawState?.teams?.['0'] || null,
      1: rawState?.teams?.[1] || rawState?.teams?.['1'] || null
    },
    game: rawState?.game || null
  };
}

function readLocalSessionState(sessionId) {
  try {
    return normalizeSessionState(JSON.parse(localStorage.getItem(`${LOCAL_SESSION_PREFIX}${sessionId}`) || '{}'), sessionId);
  } catch (error) {
    return normalizeSessionState({}, sessionId);
  }
}

function writeLocalSessionState(sessionId, sessionState) {
  localStorage.setItem(`${LOCAL_SESSION_PREFIX}${sessionId}`, JSON.stringify(normalizeSessionState(sessionState, sessionId)));
}

function readLocalLobbyState() {
  try {
    return normalizeLobbyState(JSON.parse(localStorage.getItem(LOCAL_LOBBY_STORAGE_KEY) || '{"teams":[]}'));
  } catch (error) {
    return { teams: [] };
  }
}

function writeLocalLobbyState(lobbyState) {
  const normalized = normalizeLobbyState(lobbyState);
  localStorage.setItem(LOCAL_LOBBY_STORAGE_KEY, JSON.stringify(normalized));
  localListeners.forEach((listener) => listener(normalized));
}

async function getFirebaseApi() {
  if (!isFirebaseConfigured) {
    return null;
  }
  if (!firebaseApiPromise) {
    firebaseApiPromise = Promise.all([
      import('https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js'),
      import('https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js')
    ]).then(([appModule, databaseModule, authModule]) => {
      const app = appModule.initializeApp(firebaseConfig);
      const db = normalizedDatabaseUrl
        ? databaseModule.getDatabase(app, normalizedDatabaseUrl)
        : databaseModule.getDatabase(app);
      const auth = authModule.getAuth(app);
      const authReady = auth.currentUser
        ? Promise.resolve(auth.currentUser)
        : authModule.signInAnonymously(auth).then((result) => result.user);
      return {
        db,
        auth,
        authReady,
        ref: databaseModule.ref,
        get: databaseModule.get,
        set: databaseModule.set,
        onValue: databaseModule.onValue,
        off: databaseModule.off,
        runTransaction: databaseModule.runTransaction
      };
    });
  }
  return firebaseApiPromise;
}

async function runLocalMutation(mutator) {
  const lobbyState = readLocalLobbyState();
  const nextLobbyState = mutator(lobbyState);
  const normalized = normalizeLobbyState(nextLobbyState || lobbyState);
  writeLocalLobbyState(normalized);
  return normalized;
}

async function runFirebaseMutation(mutator) {
  const api = await getFirebaseApi();
  await api.authReady;
  const teamsRef = api.ref(api.db, 'tugwar/lobby/teams');
  const transactionResult = await api.runTransaction(teamsRef, (currentValue) => {
    const currentTeams = mapToLobbyState(currentValue).teams;
    const mutatedState = mutator({ teams: currentTeams });
    return teamArrayToMap(normalizeLobbyState(mutatedState || { teams: currentTeams }).teams);
  });
  return mapToLobbyState(transactionResult.snapshot.val());
}

function chooseMutationRunner() {
  return isFirebaseConfigured ? runFirebaseMutation : runLocalMutation;
}

export function getMultiplayerBackendLabel() {
  return isFirebaseConfigured ? 'Firebase Realtime Database' : 'Local browser storage';
}

export async function getLobbySnapshot() {
  if (!isFirebaseConfigured) {
    return readLocalLobbyState();
  }
  const api = await getFirebaseApi();
  await api.authReady;
  const snapshot = await api.get(api.ref(api.db, 'tugwar/lobby/teams'));
  return mapToLobbyState(snapshot.val());
}

export async function saveLobbyTeam(team) {
  const runMutation = chooseMutationRunner();
  return runMutation((lobbyState) => {
    const teams = lobbyState.teams.filter((entry) => entry.id !== team.id);
    teams.push({ ...team, updatedAt: Date.now() });
    return { teams };
  });
}

export async function removeLobbyTeam(teamId) {
  const runMutation = chooseMutationRunner();
  return runMutation((lobbyState) => {
    const teams = lobbyState.teams.map((team) => ({ ...team }));
    const currentTeam = teams.find((team) => team.id === teamId);
    if (!currentTeam) {
      return { teams };
    }
    if (currentTeam.opponentId) {
      const opponentTeam = teams.find((team) => team.id === currentTeam.opponentId);
      if (opponentTeam) {
        opponentTeam.status = 'waiting';
        opponentTeam.opponentId = null;
        opponentTeam.slot = null;
        opponentTeam.setupConfirmed = false;
        opponentTeam.updatedAt = Date.now();
      }
    }
    return { teams: teams.filter((team) => team.id !== teamId) };
  });
}

export async function matchLobbyTeams(teamId, opponentId) {
  const runMutation = chooseMutationRunner();
  return runMutation((lobbyState) => {
    const teams = lobbyState.teams.map((team) => ({ ...team }));
    const currentTeam = teams.find((team) => team.id === teamId);
    const opponentTeam = teams.find((team) => team.id === opponentId);
    if (!currentTeam || !opponentTeam || currentTeam.status !== 'waiting' || opponentTeam.status !== 'waiting') {
      return { teams };
    }
    const sessionId = currentTeam.sessionId || opponentTeam.sessionId || `${currentTeam.id}-${opponentTeam.id}`;
    currentTeam.status = 'matched';
    currentTeam.opponentId = opponentTeam.id;
    currentTeam.slot = 0;
    currentTeam.sessionId = sessionId;
    currentTeam.setupConfirmed = false;
    currentTeam.updatedAt = Date.now();

    opponentTeam.status = 'matched';
    opponentTeam.opponentId = currentTeam.id;
    opponentTeam.slot = 1;
    opponentTeam.sessionId = sessionId;
    opponentTeam.setupConfirmed = false;
    opponentTeam.updatedAt = Date.now();
    return { teams };
  });
}

export async function setLobbyTeamSetupConfirmed(teamId, setupConfirmed) {
  const runMutation = chooseMutationRunner();
  return runMutation((lobbyState) => {
    const teams = lobbyState.teams.map((team) => ({ ...team }));
    const currentTeam = teams.find((team) => team.id === teamId);
    if (!currentTeam) {
      return { teams };
    }
    currentTeam.setupConfirmed = Boolean(setupConfirmed);
    currentTeam.updatedAt = Date.now();
    return { teams };
  });
}

export async function getSessionSnapshot(sessionId) {
  if (!isFirebaseConfigured) {
    return readLocalSessionState(sessionId);
  }
  const api = await getFirebaseApi();
  await api.authReady;
  const snapshot = await api.get(api.ref(api.db, `tugwar/sessions/${sessionId}`));
  return normalizeSessionState(snapshot.val(), sessionId);
}

export async function saveSessionTeam(sessionId, slot, teamData) {
  if (!isFirebaseConfigured) {
    const sessionState = readLocalSessionState(sessionId);
    sessionState.teams[slot] = { ...(sessionState.teams[slot] || {}), ...teamData };
    sessionState.updatedAt = Date.now();
    writeLocalSessionState(sessionId, sessionState);
    return sessionState;
  }
  const api = await getFirebaseApi();
  await api.authReady;
  const sessionRef = api.ref(api.db, `tugwar/sessions/${sessionId}`);
  const result = await api.runTransaction(sessionRef, (currentValue) => {
    const sessionState = normalizeSessionState(currentValue || {}, sessionId);
    sessionState.teams[slot] = { ...(sessionState.teams[slot] || {}), ...teamData };
    sessionState.updatedAt = Date.now();
    return sessionState;
  });
  return normalizeSessionState(result.snapshot.val(), sessionId);
}

export async function mutateSessionState(sessionId, mutator) {
  if (!isFirebaseConfigured) {
    const sessionState = readLocalSessionState(sessionId);
    const nextState = normalizeSessionState(mutator(sessionState) || sessionState, sessionId);
    writeLocalSessionState(sessionId, nextState);
    return nextState;
  }
  const api = await getFirebaseApi();
  await api.authReady;
  const sessionRef = api.ref(api.db, `tugwar/sessions/${sessionId}`);
  const result = await api.runTransaction(sessionRef, (currentValue) => {
    const sessionState = normalizeSessionState(currentValue || {}, sessionId);
    const nextState = normalizeSessionState(mutator(sessionState) || sessionState, sessionId);
    nextState.updatedAt = Date.now();
    return nextState;
  });
  return normalizeSessionState(result.snapshot.val(), sessionId);
}

export function subscribeToSession(sessionId, listener) {
  if (!isFirebaseConfigured) {
    const key = `${LOCAL_SESSION_PREFIX}${sessionId}`;
    const storageHandler = (event) => {
      if (event.key === key) {
        listener(readLocalSessionState(sessionId));
      }
    };
    window.addEventListener('storage', storageHandler);
    listener(readLocalSessionState(sessionId));
    return () => {
      window.removeEventListener('storage', storageHandler);
    };
  }

  let unsubscribe = () => {};
  getFirebaseApi().then((api) => {
    api.authReady.then(() => {
      const sessionRef = api.ref(api.db, `tugwar/sessions/${sessionId}`);
      unsubscribe = api.onValue(sessionRef, (snapshot) => {
        listener(normalizeSessionState(snapshot.val(), sessionId));
      });
    });
  });
  return () => unsubscribe();
}

export function subscribeToLobby(listener) {
  if (!isFirebaseConfigured) {
    const wrapped = () => listener(readLocalLobbyState());
    localListeners.push(listener);
    const storageHandler = (event) => {
      if (event.key === LOCAL_LOBBY_STORAGE_KEY) {
        wrapped();
      }
    };
    window.addEventListener('storage', storageHandler);
    listener(readLocalLobbyState());
    return () => {
      localListeners = localListeners.filter((entry) => entry !== listener);
      window.removeEventListener('storage', storageHandler);
    };
  }

  let unsubscribe = () => {};
  getFirebaseApi().then((api) => {
    api.authReady.then(() => {
      const lobbyRef = api.ref(api.db, 'tugwar/lobby/teams');
      unsubscribe = api.onValue(lobbyRef, (snapshot) => {
        listener(mapToLobbyState(snapshot.val()));
      });
    });
  });
  return () => unsubscribe();
}