// Track last question and wrong answer state
let lastQuestion = null;
let wrongStreak = 0;
import { getTeam1PlayersDiv, getTeam2PlayersDiv, getTeamForm, getGameCanvas, getModeSelectDiv, showFormError, hideFormError } from './modules/dom.js';
import { gameState, POINTS_TO_WIN } from './modules/gameState.js';
import { createPlayerInputs, setRopePosition } from './modules/ui.js';
import { applyGameSnapshot, buildInitialGameSnapshot, drawGame, endGame, handleAnswer, nextQuestion, resolveSubmittedAnswer, tickGameSnapshot } from './modules/gameLogic.js';
import { getLobbySnapshot, getMultiplayerBackendLabel, getSessionSnapshot, matchLobbyTeams, mutateSessionState, removeLobbyTeam, saveLobbyTeam, saveSessionTeam, subscribeToLobby, subscribeToSession } from './modules/multiplayerBackend.js';

const SESSION_OWNER_KEY = 'tugwar-diff-owner-v1';
const SESSION_TEAM_KEY = 'tugwar-diff-team-v1';
let currentLobbyState = { teams: [] };
let stopLobbySubscription = null;
let currentSessionState = null;
let currentSessionId = null;
let stopSessionSubscription = null;
let hostTickInterval = null;
let hostTickPending = false;

function createSessionId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionOwnerId() {
  let ownerId = sessionStorage.getItem(SESSION_OWNER_KEY);
  if (!ownerId) {
    ownerId = createSessionId('player');
    sessionStorage.setItem(SESSION_OWNER_KEY, ownerId);
  }
  return ownerId;
}

function getCurrentLobbyTeamId() {
  return sessionStorage.getItem(SESSION_TEAM_KEY);
}

function setCurrentLobbyTeamId(teamId) {
  if (teamId) {
    sessionStorage.setItem(SESSION_TEAM_KEY, teamId);
  } else {
    sessionStorage.removeItem(SESSION_TEAM_KEY);
  }
}

// Play feedback sound
function playFeedbackSound(type) {
  const clap = document.getElementById('clap-audio');
  const aw = document.getElementById('aw-audio');
  if (type === 'clap' && clap) {
    try {
      clap.currentTime = 0;
      const playPromise = clap.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch (e) {
      // Ignore audio errors
    }
  } else if (type === 'aw' && aw) {
    try {
      aw.currentTime = 0;
      const playPromise = aw.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch (e) {
      // Ignore audio errors
    }
  }
}
import { resetGameState } from './modules/gameState.js';

function startGame() {
  // Always use fallback values for team names and player names
  if (gameState.playMode === 'same') {
    const team1NameInput = document.getElementById('team1-name');
    const team2NameInput = document.getElementById('team2-name');
    gameState.teamNames[0] = (team1NameInput && team1NameInput.value) ? team1NameInput.value : 'Team 1';
    gameState.teamNames[1] = (team2NameInput && team2NameInput.value) ? team2NameInput.value : 'Team 2';
    if (typeof updateHeroSection === 'function') updateHeroSection();
    const team1Players = getTeam1PlayersDiv();
    const team2Players = getTeam2PlayersDiv();
    gameState.playerNames[0] = team1Players ? Array.from(team1Players.querySelectorAll('input')).map((i, idx) => i.value || (idx === 0 ? 'A' : 'B')) : ['A', 'B'];
    gameState.playerNames[1] = team2Players ? Array.from(team2Players.querySelectorAll('input')).map((i, idx) => i.value || (idx === 0 ? 'C' : 'D')) : ['C', 'D'];
    gameState.teamScores[0] = 0; gameState.teamScores[1] = 0;
    gameState.teamDifficulty[0] = 0; gameState.teamDifficulty[1] = 0;
    gameState.currentPlayer[0] = 0; gameState.currentPlayer[1] = 0;
    gameState.currentQuestion[0] = null; gameState.currentQuestion[1] = null;
    gameState.currentAnswer[0] = '';
    gameState.currentAnswer[1] = '';
    gameState.questionTimeLeft[0] = 0; gameState.questionTimeLeft[1] = 0;
    gameState.teamTimeLeft[0] = 150; gameState.teamTimeLeft[1] = 150;
    gameState.gameActive = true;
    if (gameState.gameTimer) clearInterval(gameState.gameTimer);
    gameState.currentTeam = 0;
    gameState.gameTimer = setInterval(() => {
      for (let t = 0; t < 2; t++) {
        if (gameState.teamTimeLeft[t] > 0) {
          gameState.teamTimeLeft[t]--;
          if (gameState.teamTimeLeft[t] <= 0) {
            gameState.teamTimeLeft[t] = 0;
            endGame();
          }
        }
      }
      drawGame();
    }, 1000);
    nextQuestion(gameState.currentTeam);
    drawGame();
    // Show answer input area
    const answerArea = document.getElementById('answer-area');
    if (answerArea) answerArea.style.display = '';
    const answerInput = document.getElementById('answer-input');
    if (answerInput) answerInput.value = '';

    // Alternate teams after every answer
    const answerInputElem = document.getElementById('answer-input');
    const submitAnswerBtn = document.getElementById('submit-answer-btn');
    function alternateSubmit() {
      if (!gameState.gameActive) return;
      if (!answerInputElem) return;
      const ans = answerInputElem.value.trim();
      if (ans === '') return;
      const teamIdx = gameState.currentTeam;
      const questionObj = gameState.currentQuestion[teamIdx];
      const correctAns = questionObj?.ans;
      const correct = (ans !== null && String(ans).trim() === String(correctAns));
      playFeedbackSound(correct ? 'clap' : 'aw');
      handleAnswer(ans);
      answerInputElem.value = '';
      answerInputElem.focus();
      drawGame();
    }
    if (submitAnswerBtn) {
      submitAnswerBtn.onclick = alternateSubmit;
    }
    if (answerInputElem) {
      answerInputElem.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          alternateSubmit();
        }
      });
    }
  } else if (gameState.playMode === 'diff') {
    const t = gameState.selectedTeam;
    const teamNameInput = document.getElementById(t === 0 ? 'team1-name' : 'team2-name');
    gameState.teamNames[t] = (teamNameInput && teamNameInput.value) ? teamNameInput.value : (t === 0 ? 'Team 1' : 'Team 2');
    const teamPlayersDiv = t === 0 ? getTeam1PlayersDiv() : getTeam2PlayersDiv();
    gameState.playerNames[t] = teamPlayersDiv ? Array.from(teamPlayersDiv.querySelectorAll('input')).map(i => i.value || 'Player') : ['Player 1', 'Player 2'];
    gameState.teamScores[t] = 0;
    gameState.teamDifficulty[t] = 0;
    gameState.currentPlayer[t] = 0;
    gameState.currentQuestion[t] = null;
    gameState.currentAnswer[t] = '';
    gameState.questionTimeLeft[t] = 0;
    gameState.teamTimeLeft[t] = 150;
    gameState.gameActive = true;
    if (gameState.gameTimer) clearInterval(gameState.gameTimer);
    gameState.gameTimer = setInterval(() => {
      if (gameState.teamTimeLeft[t] > 0) {
        gameState.teamTimeLeft[t]--;
        if (gameState.teamTimeLeft[t] <= 0) {
          gameState.teamTimeLeft[t] = 0;
          endGame();
        }
      }
      drawGame();
    }, 1000);
    nextQuestion(t);
    drawGame();
    // Show answer input area
    const answerArea = document.getElementById('answer-area');
    if (answerArea) answerArea.style.display = '';
    const answerInput = document.getElementById('answer-input');
    if (answerInput) answerInput.value = '';
  }
}

document.addEventListener('DOMContentLoaded', function() {
        // Live update team names in hero and math sections as user types
        const team1NameInput = document.getElementById('team1-name');
        const team2NameInput = document.getElementById('team2-name');
        if (team1NameInput) {
          team1NameInput.addEventListener('input', function() {
            gameState.teamNames[0] = team1NameInput.value || 'Team 1';
            if (typeof updateHeroSection === 'function') updateHeroSection();
          });
        }
        if (team2NameInput) {
          team2NameInput.addEventListener('input', function() {
            gameState.teamNames[1] = team2NameInput.value || 'Team 2';
            if (typeof updateHeroSection === 'function') updateHeroSection();
          });
        }
    // Answer input logic
    const answerArea = document.getElementById('answer-area');
    const answerInput = document.getElementById('answer-input');
    const submitAnswerBtn = document.getElementById('submit-answer-btn');
    async function submitAnswer() {
      if (!gameState.gameActive) return;
      if (!answerInput) return;
      const ans = answerInput.value.trim();
      if (ans === '') return;
      if (gameState.playMode === 'diff') {
        const isCorrect = String(ans).trim() === String(gameState.currentQuestion[gameState.currentTeam]?.ans);
        playFeedbackSound(isCorrect ? 'clap' : 'aw');
        await submitMultiplayerAnswer(ans);
        answerInput.value = '';
        answerInput.blur();
        return;
      }
      // Determine if answer is correct before handling
      const teamIdx = gameState.currentTeam;
      const questionObj = gameState.currentQuestion[teamIdx];
      const correctAns = questionObj?.ans;
      const correct = (ans !== null && String(ans).trim() === String(correctAns));
      playFeedbackSound(correct ? 'clap' : 'aw');
      // Show answer result
      const answerResult = document.getElementById('answer-result');
      const answerSubmitted = document.getElementById('answer-submitted');
      const answerSign = document.getElementById('answer-sign');
      if (answerResult && answerSubmitted && answerSign) {
        answerResult.style.display = 'block';
        answerSubmitted.textContent = `You answered: ${ans}`;
        answerSign.textContent = correct ? '✔' : '✖';
        answerSign.className = correct ? 'correct' : 'wrong';
      }
      // Track wrong streak for this question
      if (!lastQuestion || lastQuestion !== questionObj?.q) {
        lastQuestion = questionObj?.q;
        wrongStreak = 0;
      }
      if (!correct) {
        wrongStreak++;
      } else {
        wrongStreak = 0;
      }
      handleAnswer(ans);
      answerInput.value = '';
      answerInput.focus();
      // If both teams got it wrong, show correct answer and then give new question to next team
      if (answerResult && !correct && wrongStreak >= 2) {
        setTimeout(() => {
          answerResult.style.display = 'block';
          answerSubmitted.textContent = `Correct answer: ${correctAns}`;
          answerSign.textContent = '';
          answerSign.className = '';
        }, 1200);
        setTimeout(() => {
          answerResult.style.display = 'none';
          // Give new question to next team and update current team
          wrongStreak = 0;
          lastQuestion = null;
          // Switch to next team for new question
          gameState.currentTeam = 1 - gameState.currentTeam;
          const nextTeam = gameState.currentTeam;
          if (gameState.teamTimeLeft[nextTeam] > 0) {
            nextQuestion(nextTeam);
          }
        }, 3000);
      } else if (answerResult) {
        setTimeout(() => { answerResult.style.display = 'none'; }, 1200);
      }
    }
    if (submitAnswerBtn) {
      submitAnswerBtn.onclick = submitAnswer;
    }
    if (answerInput) {
      answerInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          submitAnswer();
        }
      });
    }
  // HERO SECTION TEAM/TIMER UPDATE
  const heroTeam1Name = document.getElementById('hero-team1-name');
  const heroTeam2Name = document.getElementById('hero-team2-name');
  const heroTeam1Timer = document.getElementById('hero-team1-timer');
  const heroTeam2Timer = document.getElementById('hero-team2-timer');

  function formatTime(sec) {
    let m = Math.floor(sec/60);
    let s = sec%60;
    return `${m}:${s.toString().padStart(2,'0')}`;
  }

  function updateHeroSection() {
        // Update math section current team display
        const mathCurrentTeam = document.getElementById('math-current-team');
        if (mathCurrentTeam) {
          const teamIdx = gameState.currentTeam;
          mathCurrentTeam.textContent = `Current: ${gameState.teamNames[teamIdx] || 'Team ' + (teamIdx+1)}`;
          mathCurrentTeam.classList.remove('team1', 'team2');
          mathCurrentTeam.classList.add(teamIdx === 0 ? 'team1' : 'team2');
        }
    if (heroTeam1Name) heroTeam1Name.textContent = gameState.teamNames[0] || 'Team 1';
    if (heroTeam2Name) heroTeam2Name.textContent = gameState.teamNames[1] || 'Team 2';
    if (heroTeam1Timer) heroTeam1Timer.textContent = formatTime(gameState.teamTimeLeft[0]);
    if (heroTeam2Timer) heroTeam2Timer.textContent = formatTime(gameState.teamTimeLeft[1]);
    const heroTeam1Score = document.getElementById('hero-team1-score');
    const heroTeam2Score = document.getElementById('hero-team2-score');
    if (heroTeam1Score) heroTeam1Score.textContent = gameState.teamScores[0];
    if (heroTeam2Score) heroTeam2Score.textContent = gameState.teamScores[1];
    // Update current team display
    const heroCurrentTeam = document.getElementById('hero-current-team');
    if (heroCurrentTeam) {
      const teamIdx = gameState.currentTeam;
      heroCurrentTeam.textContent = `Current: ${gameState.teamNames[teamIdx] || 'Team ' + (teamIdx+1)}`;
    }
  }

  // Update hero section every second and after game state changes
  setInterval(updateHeroSection, 1000);
  // Also update after every drawGame
  const origDrawGame = window.drawGame || drawGame;
  window.drawGame = function(gameOver) {
    origDrawGame(gameOver);
    updateHeroSection();
    // Animate rope position based on score difference
    if (typeof setRopePosition === 'function' && gameState.teamScores) {
      // Calculate position: -1 (team 1 winning big), 1 (team 2 winning big), 0 (tie)
      const maxScore = 50; // Adjust if your win score is different
      const diff = gameState.teamScores[0] - gameState.teamScores[1];
      let pos = diff / maxScore;
      pos = Math.max(-1, Math.min(1, pos));
      setRopePosition(pos);
    }
    // Update rope team labels
    const ropeTeam1 = document.getElementById('rope-team1-label');
    const ropeTeam2 = document.getElementById('rope-team2-label');
    if (ropeTeam1) ropeTeam1.textContent = gameState.teamNames[0] || 'Team 1';
    if (ropeTeam2) ropeTeam2.textContent = gameState.teamNames[1] || 'Team 2';
  };
  updateHeroSection();
  const sidebarNewGameBtn = document.getElementById('sidebar-new-game-btn');
    if (sidebarNewGameBtn) {
      sidebarNewGameBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        await leaveCurrentLobbyTeam();
        stopSessionSync();
        if (stopLobbySubscription) {
          stopLobbySubscription();
          stopLobbySubscription = null;
        }
        resetGameState();
        // Reset UI
        const modeSelectDiv = getModeSelectDiv();
        const teamForm = getTeamForm();
        const gameCanvas = getGameCanvas();
        const newGameBtn = document.getElementById('new-game-btn');
        if (modeSelectDiv) modeSelectDiv.style.display = '';
        if (lobbyPanel) lobbyPanel.style.display = 'none';
        if (teamForm) teamForm.style.display = 'none';
        if (gameCanvas) gameCanvas.style.display = 'none';
        if (newGameBtn) newGameBtn.style.display = 'none';
      });
    }
    // Ticking sound for question timer
    const tickAudio = document.getElementById('tick-audio');
    let lastTickQ = [null, null];
    setInterval(() => {
      if (!gameState.gameActive) return;
      for (let t = 0; t < 2; t++) {
        if (gameState.questionTimeLeft[t] > 0 && gameState.currentTeam === t) {
          if (lastTickQ[t] !== gameState.questionTimeLeft[t]) {
            lastTickQ[t] = gameState.questionTimeLeft[t];
            if (tickAudio) {
              tickAudio.currentTime = 0;
              tickAudio.play();
            }
          }
        }
      }
    }, 250);
  const newGameBtn = document.getElementById('new-game-btn');
  const sameDeviceBtn = document.getElementById('same-device-btn');
  const diffDeviceBtn = document.getElementById('diff-device-btn');
  const team1PlayersDiv = getTeam1PlayersDiv();
  const team2PlayersDiv = getTeam2PlayersDiv();
  const teamForm = getTeamForm();
  const gameCanvas = getGameCanvas();
  const modeSelectDiv = getModeSelectDiv();
  const lobbyPanel = document.getElementById('lobby-panel');
  const lobbyTeamNameInput = document.getElementById('lobby-team-name');
  const createLobbyTeamBtn = document.getElementById('create-lobby-team-btn');
  const lobbyStatus = document.getElementById('lobby-status');
  const lobbyBackendIndicator = document.getElementById('lobby-backend-indicator');
  const lobbyMyTeam = document.getElementById('lobby-my-team');
  const lobbyTeamsList = document.getElementById('lobby-teams-list');
  const backToModeBtn = document.getElementById('back-to-mode-btn');
  const teamCards = document.querySelectorAll('.skribbl-form-team-card');
  const team1Card = teamCards[0];
  const team2Card = teamCards[1];
  const sessionOwnerId = getSessionOwnerId();

  function setLobbyStatus(message = '') {
    if (!lobbyStatus) return;
    lobbyStatus.textContent = message;
    lobbyStatus.classList.toggle('visible', Boolean(message));
  }

  function setLobbyBackendIndicator() {
    if (!lobbyBackendIndicator) return;
    lobbyBackendIndicator.textContent = `Lobby backend: ${getMultiplayerBackendLabel()}`;
  }

  function getCurrentLobbyTeam(lobbyState = currentLobbyState) {
    const currentTeamId = getCurrentLobbyTeamId();
    return lobbyState.teams.find((team) => team.id === currentTeamId && team.ownerId === sessionOwnerId) || null;
  }

  async function leaveCurrentLobbyTeam() {
    const lobbyState = currentLobbyState;
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    if (!currentTeam) {
      setCurrentLobbyTeamId(null);
      return;
    }
    currentLobbyState = await removeLobbyTeam(currentTeam.id);
    setCurrentLobbyTeamId(null);
  }

  function stopHostTicker() {
    if (hostTickInterval) {
      clearInterval(hostTickInterval);
      hostTickInterval = null;
    }
    hostTickPending = false;
  }

  function stopSessionSync() {
    if (stopSessionSubscription) {
      stopSessionSubscription();
      stopSessionSubscription = null;
    }
    stopHostTicker();
    currentSessionState = null;
    currentSessionId = null;
  }

  function updateDiffAnswerUi() {
    const answerArea = document.getElementById('answer-area');
    const answerInput = document.getElementById('answer-input');
    const submitBtn = document.getElementById('submit-answer-btn');
    if (!answerArea || !answerInput || !submitBtn) return;

    if (gameState.playMode !== 'diff') {
      answerInput.disabled = false;
      submitBtn.disabled = false;
      answerArea.style.display = gameState.gameActive ? '' : 'none';
      answerInput.placeholder = 'Type your answer...';
      return;
    }

    if (!currentSessionState?.game) {
      answerArea.style.display = 'none';
      answerInput.disabled = true;
      submitBtn.disabled = true;
      answerInput.placeholder = 'Waiting for match to start...';
      return;
    }

    answerArea.style.display = currentSessionState.game.gameActive ? '' : 'none';
    const isMyTurn = currentSessionState.game.gameActive && currentSessionState.game.currentTeam === gameState.selectedTeam;
    answerInput.disabled = !isMyTurn;
    submitBtn.disabled = !isMyTurn;
    answerInput.placeholder = isMyTurn ? 'Type your answer...' : 'Waiting for the other team...';
  }

  function applySessionState(sessionState) {
    currentSessionState = sessionState;
    if (!sessionState?.game) {
      updateDiffAnswerUi();
      return;
    }

    gameState.playMode = 'diff';
    applyGameSnapshot(sessionState.game);
    modeSelectDiv.style.display = 'none';
    if (lobbyPanel) lobbyPanel.style.display = 'none';
    if (teamForm) teamForm.style.display = 'none';
    if (gameCanvas) {
      gameCanvas.style.display = 'block';
      gameCanvas.width = 700;
      gameCanvas.height = 400;
    }
    drawGame(!gameState.gameActive);
    updateDiffAnswerUi();
  }

  function startHostTickerIfNeeded() {
    stopHostTicker();
    if (!currentSessionId || !currentSessionState?.game?.gameActive) {
      return;
    }
    if (currentSessionState.hostOwnerId !== sessionOwnerId) {
      return;
    }

    hostTickInterval = setInterval(async () => {
      if (hostTickPending) {
        return;
      }
      hostTickPending = true;
      try {
        currentSessionState = await mutateSessionState(currentSessionId, (sessionState) => {
          if (sessionState.status !== 'active' || !sessionState.game?.gameActive) {
            return sessionState;
          }
          const nextGame = tickGameSnapshot(sessionState.game);
          return {
            ...sessionState,
            status: nextGame.gameActive ? 'active' : 'finished',
            game: nextGame
          };
        });
      } finally {
        hostTickPending = false;
      }
    }, 1000);
  }

  async function attachSession(sessionId) {
    currentSessionId = sessionId;
    if (stopSessionSubscription) {
      stopSessionSubscription();
    }
    stopSessionSubscription = subscribeToSession(sessionId, (sessionState) => {
      applySessionState(sessionState);
      startHostTickerIfNeeded();
    });
    const snapshot = await getSessionSnapshot(sessionId);
    applySessionState(snapshot);
    startHostTickerIfNeeded();
  }

  async function ensureSessionStarted(sessionId) {
    currentSessionState = await mutateSessionState(sessionId, (sessionState) => {
      const team0 = sessionState.teams[0];
      const team1 = sessionState.teams[1];
      if (!team0?.ready || !team1?.ready || sessionState.game) {
        return sessionState;
      }
      return {
        ...sessionState,
        hostOwnerId: sessionState.hostOwnerId || team0.ownerId,
        status: 'active',
        game: buildInitialGameSnapshot(
          [team0.name || 'Team 1', team1.name || 'Team 2'],
          [team0.players || ['Player 1', 'Player 2'], team1.players || ['Player 1', 'Player 2']]
        )
      };
    });
  }

  async function submitMultiplayerAnswer(answerValue) {
    if (!currentSessionId || !currentSessionState?.game?.gameActive) {
      return;
    }
    if (currentSessionState.game.currentTeam !== gameState.selectedTeam) {
      return;
    }

    currentSessionState = await mutateSessionState(currentSessionId, (sessionState) => {
      if (sessionState.status !== 'active' || !sessionState.game?.gameActive) {
        return sessionState;
      }
      if (sessionState.game.currentTeam !== gameState.selectedTeam) {
        return sessionState;
      }
      const nextGame = resolveSubmittedAnswer(sessionState.game, answerValue);
      return {
        ...sessionState,
        status: nextGame.gameActive ? 'active' : 'finished',
        game: nextGame
      };
    });
  }

  function configureDiffTeamForm(selectedTeam) {
    const team1NameInput = document.getElementById('team1-name');
    const team2NameInput = document.getElementById('team2-name');
    if (!team1NameInput || !team2NameInput) return;

    const selectedPlayersDiv = selectedTeam === 0 ? team1PlayersDiv : team2PlayersDiv;
    const otherPlayersDiv = selectedTeam === 0 ? team2PlayersDiv : team1PlayersDiv;

    createPlayerInputs(selectedPlayersDiv, selectedTeam === 0 ? 'team1' : 'team2');

    selectedPlayersDiv.style.display = '';
    otherPlayersDiv.style.display = 'none';
    if (team1Card) team1Card.style.display = selectedTeam === 0 ? '' : 'none';
    if (team2Card) team2Card.style.display = selectedTeam === 1 ? '' : 'none';

    team1NameInput.required = selectedTeam === 0;
    team1NameInput.disabled = selectedTeam !== 0;
    team2NameInput.required = selectedTeam === 1;
    team2NameInput.disabled = selectedTeam !== 1;

    Array.from(selectedPlayersDiv.querySelectorAll('input')).forEach((input) => {
      input.required = true;
      input.disabled = false;
    });
    Array.from(otherPlayersDiv.querySelectorAll('input')).forEach((input) => {
      input.required = false;
      input.disabled = true;
    });
  }

  async function openDiffTeamSetup() {
    const lobbyState = currentLobbyState;
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    if (!currentTeam || currentTeam.status !== 'matched' || currentTeam.slot === null) {
      setLobbyStatus('Match your team with an opponent before continuing.');
      return;
    }

    const opponentTeam = lobbyState.teams.find((team) => team.id === currentTeam.opponentId);
    if (!opponentTeam) {
      setLobbyStatus('Your selected opponent is no longer available.');
      await leaveCurrentLobbyTeam();
      renderLobby();
      return;
    }

    gameState.playMode = 'diff';
    gameState.selectedTeam = currentTeam.slot;
    gameState.teamNames[currentTeam.slot] = currentTeam.name;
    gameState.teamNames[1 - currentTeam.slot] = opponentTeam.name;

    const team1NameInput = document.getElementById('team1-name');
    const team2NameInput = document.getElementById('team2-name');
    if (team1NameInput) team1NameInput.value = gameState.teamNames[0];
    if (team2NameInput) team2NameInput.value = gameState.teamNames[1];
    currentSessionId = currentTeam.sessionId || null;

    modeSelectDiv.style.display = 'none';
    if (lobbyPanel) lobbyPanel.style.display = 'none';
    teamForm.style.display = '';
    gameCanvas.style.display = 'none';
    hideFormError();
    configureDiffTeamForm(currentTeam.slot);
    if (currentSessionId) {
      await attachSession(currentSessionId);
    }
  }

  async function createOrUpdateLobbyTeam() {
    const requestedName = lobbyTeamNameInput ? lobbyTeamNameInput.value.trim() : '';
    if (!requestedName) {
      setLobbyStatus('Enter a team name before creating a lobby team.');
      return;
    }

    const lobbyState = currentLobbyState;
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    if (currentTeam && currentTeam.status === 'matched') {
      setLobbyStatus('Your team is already matched. Continue to game setup.');
      renderLobby();
      return;
    }

    const duplicateName = lobbyState.teams.find((team) => team.name.toLowerCase() === requestedName.toLowerCase() && team.id !== currentTeam?.id);
    if (duplicateName) {
      setLobbyStatus('That team name is already in the lobby. Choose another one.');
      return;
    }

    const now = Date.now();
    let teamToSave;
    if (currentTeam) {
      teamToSave = {
        ...currentTeam,
        name: requestedName,
        updatedAt: now
      };
    } else {
      teamToSave = {
        id: createSessionId('team'),
        ownerId: sessionOwnerId,
        name: requestedName,
        status: 'waiting',
        opponentId: null,
        slot: null,
        createdAt: now,
        updatedAt: now
      };
      setCurrentLobbyTeamId(teamToSave.id);
    }

    currentLobbyState = await saveLobbyTeam(teamToSave);
    setLobbyStatus('Your team is in the lobby and waiting for an opponent.');
    renderLobby();
  }

  async function selectOpponentTeam(opponentId) {
    const lobbyState = currentLobbyState;
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    if (!currentTeam) {
      setLobbyStatus('Create your team before selecting an opponent.');
      renderLobby();
      return;
    }
    if (currentTeam.status !== 'waiting') {
      setLobbyStatus('Your team is already matched. Continue to game setup.');
      renderLobby();
      return;
    }

    const opponentTeam = lobbyState.teams.find((team) => team.id === opponentId);
    if (!opponentTeam || opponentTeam.status !== 'waiting') {
      setLobbyStatus('That team was just selected by someone else. Pick another waiting team.');
      renderLobby();
      return;
    }

    currentLobbyState = await matchLobbyTeams(currentTeam.id, opponentTeam.id);
    const matchedOpponent = currentLobbyState.teams.find((team) => team.id === opponentTeam.id);
    if (!matchedOpponent || matchedOpponent.status !== 'matched') {
      setLobbyStatus('That team was just selected by someone else. Pick another waiting team.');
      renderLobby();
      return;
    }

    setLobbyStatus(`Matched with ${opponentTeam.name}. Continue to game setup.`);
    renderLobby();
  }

  function renderLobby() {
    if (!lobbyPanel || !lobbyMyTeam || !lobbyTeamsList) return;

    const lobbyState = currentLobbyState;
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    const waitingTeams = lobbyState.teams.filter((team) => team.status === 'waiting' && team.id !== currentTeam?.id);

    if (lobbyTeamNameInput && currentTeam && !lobbyTeamNameInput.value) {
      lobbyTeamNameInput.value = currentTeam.name;
    }

    if (!currentTeam) {
      lobbyMyTeam.innerHTML = '<p class="lobby-empty">No team created yet.</p>';
    } else {
      const opponentTeam = currentTeam.opponentId ? lobbyState.teams.find((team) => team.id === currentTeam.opponentId) : null;
      const actionButton = currentTeam.status === 'matched'
        ? '<button type="button" id="lobby-continue-btn">Continue to Game Setup</button>'
        : '<button type="button" id="lobby-remove-team-btn" class="lobby-secondary-btn">Remove Team</button>';

      lobbyMyTeam.innerHTML = `
        <article class="lobby-card">
          <div class="lobby-card-header">
            <span class="lobby-team-title">${currentTeam.name}</span>
            <span class="lobby-badge${currentTeam.status === 'matched' ? ' matched' : ''}">${currentTeam.status === 'matched' ? 'Matched' : 'Waiting'}</span>
          </div>
          <div>${currentTeam.status === 'matched' && opponentTeam ? `Opponent selected: <strong>${opponentTeam.name}</strong>` : 'Waiting for another team to choose this matchup.'}</div>
          <div class="lobby-card-actions">${actionButton}</div>
        </article>`;
    }

    if (!waitingTeams.length) {
      lobbyTeamsList.innerHTML = '<p class="lobby-empty">No teams are waiting right now.</p>';
    } else {
      lobbyTeamsList.innerHTML = waitingTeams.map((team) => `
        <article class="lobby-card">
          <div class="lobby-card-header">
            <span class="lobby-team-title">${team.name}</span>
            <span class="lobby-badge">Waiting</span>
          </div>
          <div>Available to be selected as your opponent.</div>
          <div class="lobby-card-actions">
            <button type="button" class="lobby-select-team-btn" data-team-id="${team.id}" ${currentTeam && currentTeam.status === 'waiting' ? '' : 'disabled'}>Play This Team</button>
          </div>
        </article>`).join('');
    }

    const continueBtn = document.getElementById('lobby-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', openDiffTeamSetup);
    }

    const removeBtn = document.getElementById('lobby-remove-team-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async function() {
        await leaveCurrentLobbyTeam();
        setLobbyStatus('Your team was removed from the lobby.');
        renderLobby();
      });
    }

    document.querySelectorAll('.lobby-select-team-btn').forEach((button) => {
      button.addEventListener('click', function() {
        selectOpponentTeam(button.dataset.teamId);
      });
    });
  }

  function openLobbyPanel() {
    gameState.playMode = 'diff';
    stopSessionSync();
    modeSelectDiv.style.display = 'none';
    teamForm.style.display = 'none';
    gameCanvas.style.display = 'none';
    if (lobbyPanel) lobbyPanel.style.display = '';
    hideFormError();
    setLobbyBackendIndicator();
    setLobbyStatus(`Lobby backend: ${getMultiplayerBackendLabel()}.`);
    if (stopLobbySubscription) {
      stopLobbySubscription();
    }
    stopLobbySubscription = subscribeToLobby((lobbyState) => {
      currentLobbyState = lobbyState;
      if (lobbyPanel && lobbyPanel.style.display !== 'none') {
        renderLobby();
      }
    });
    getLobbySnapshot().then((lobbyState) => {
      currentLobbyState = lobbyState;
      renderLobby();
    });
    renderLobby();
  }

  if (sameDeviceBtn) {
    sameDeviceBtn.onclick = async function() {
      gameState.playMode = 'same';
      await leaveCurrentLobbyTeam();
      stopSessionSync();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      modeSelectDiv.style.display = 'none';
      // Ensure player inputs and team name fields are created before showing the form
      createPlayerInputs(team1PlayersDiv, 'team1');
      createPlayerInputs(team2PlayersDiv, 'team2');
      setTimeout(() => {
        teamForm.style.display = '';
      }, 0);
    };
  }

  if (diffDeviceBtn) {
    diffDeviceBtn.onclick = function() {
      openLobbyPanel();
    };
  }

  if (createLobbyTeamBtn) {
    createLobbyTeamBtn.addEventListener('click', createOrUpdateLobbyTeam);
  }

  if (lobbyTeamNameInput) {
    lobbyTeamNameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        createOrUpdateLobbyTeam();
      }
    });
  }

  if (backToModeBtn) {
    backToModeBtn.addEventListener('click', async function() {
      await leaveCurrentLobbyTeam();
      stopSessionSync();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      setLobbyStatus('');
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      modeSelectDiv.style.display = '';
    });
  }

  if (teamForm) {
    teamForm.onsubmit = async function(e) {
      e.preventDefault();
      // Extra safety: check team name fields exist before starting game
      const team1NameInput = document.getElementById('team1-name');
      const team2NameInput = document.getElementById('team2-name');
      if (!team1NameInput || !team2NameInput) {
        showFormError('Team name fields are missing. Please reload the page.');
        return;
      }
      if (gameState.playMode === 'diff') {
        const lobbyState = currentLobbyState;
        const currentTeam = getCurrentLobbyTeam(lobbyState);
        const opponentTeam = currentTeam ? lobbyState.teams.find((team) => team.id === currentTeam.opponentId) : null;
        if (!currentTeam || currentTeam.status !== 'matched' || !opponentTeam) {
          showFormError('Match your team with an opponent in the lobby before starting.');
          return;
        }
        currentSessionId = currentTeam.sessionId || null;
        if (!currentSessionId) {
          showFormError('Missing session for this match. Go back to the lobby and select an opponent again.');
          return;
        }

        const selectedTeam = currentTeam.slot;
        const selectedPlayersDiv = selectedTeam === 0 ? team1PlayersDiv : team2PlayersDiv;
        const selectedTeamName = selectedTeam === 0 ? team1NameInput.value.trim() : team2NameInput.value.trim();
        const selectedPlayers = Array.from(selectedPlayersDiv.querySelectorAll('input'))
          .map((input, index) => input.value.trim() || `Player ${index + 1}`)
          .filter(Boolean);

        currentSessionState = await saveSessionTeam(currentSessionId, selectedTeam, {
          teamId: currentTeam.id,
          ownerId: sessionOwnerId,
          slot: selectedTeam,
          name: selectedTeamName || `Team ${selectedTeam + 1}`,
          players: selectedPlayers,
          ready: true
        });
        await attachSession(currentSessionId);
        await ensureSessionStarted(currentSessionId);

        hideFormError();
        teamForm.style.display = 'none';
        if (gameCanvas) gameCanvas.style.display = 'block';
        const answerArea = document.getElementById('answer-area');
        if (answerArea) answerArea.style.display = '';
        setLobbyStatus('Waiting for the shared match state...');
        return;
      }
      modeSelectDiv.style.display = 'none';
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      teamForm.style.display = 'none';
      gameCanvas.style.display = 'block';
      gameCanvas.width = 700;
      gameCanvas.height = 400;
      startGame();
      drawGame();
      if (newGameBtn) newGameBtn.style.display = 'none';
    };
  }

  window.addEventListener('keydown', function(e) {
    if (!gameState.gameActive) return;
    if (e.key === 'Backspace') {
      gameState.currentAnswer[gameState.currentTeam] = gameState.currentAnswer[gameState.currentTeam].slice(0, -1);
    } else if (e.key === 'Enter') {
      handleAnswer(gameState.currentAnswer[gameState.currentTeam]);
    } else if (/^[0-9\-]$/.test(e.key)) {
      gameState.currentAnswer[gameState.currentTeam] += e.key;
    }
    drawGame();
  });

  // Show new game button at game over
  const originalDrawGame = drawGame;
  function drawGameWithNewGameBtn(gameOver = false) {
    originalDrawGame(gameOver);
    // Show/hide answer area based on game state
    const answerArea = document.getElementById('answer-area');
    if (answerArea) answerArea.style.display = (gameOver || !gameState.gameActive) ? 'none' : '';
    if (newGameBtn) {
      if (gameOver || !gameState.gameActive) {
        newGameBtn.style.display = 'inline-block';
      } else {
        newGameBtn.style.display = 'none';
      }
    }
  }
  // Override drawGame globally
  window.drawGame = drawGameWithNewGameBtn;

  if (newGameBtn) {
    newGameBtn.addEventListener('click', async function() {
      await leaveCurrentLobbyTeam();
      stopSessionSync();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      resetGameState();
      // Reset UI
      if (modeSelectDiv) modeSelectDiv.style.display = '';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (gameCanvas) gameCanvas.style.display = 'none';
      newGameBtn.style.display = 'none';
    });
  }
});
