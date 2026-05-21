import { getTeam1PlayersDiv, getTeam2PlayersDiv, getTeamForm, getGameCanvas, getModeSelectDiv, showFormError, hideFormError } from './modules/dom.js';
import { DIFFICULTY } from './modules/difficulty.js';
import { gameState, POINTS_TO_WIN } from './modules/gameState.js';
import { createPlayerInputs, setRopePosition } from './modules/ui.js';
import { applyGameSnapshot, buildInitialGameSnapshot, drawGame, endGame, handleAnswer, nextQuestion, resolveSubmittedAnswer, tickGameSnapshot } from './modules/gameLogic.js';
import { getLobbySnapshot, getMultiplayerBackendLabel, getSessionSnapshot, matchLobbyTeams, mutateSessionState, releaseExpiredLobbyMatches, removeLobbyTeam, returnTeamToLobby, saveLobbyTeam, saveSessionTeam, setLobbyTeamSetupConfirmed, subscribeToLobby, subscribeToSession } from './modules/multiplayerBackend.js';

const SESSION_OWNER_KEY = 'tugwar-diff-owner-v1';
const SESSION_TEAM_KEY = 'tugwar-diff-team-v1';
const LOBBY_WAITING_TEAMS_PER_PAGE = 8;
let currentLobbyState = { teams: [] };
let stopLobbySubscription = null;
let currentSessionState = null;
let currentSessionId = null;
let stopSessionSubscription = null;
let hostTickInterval = null;
let hostTickPending = false;
let lobbyExpiryInterval = null;
let activeGameResultKey = null;
let lobbyWaitingTeamsPage = 1;

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

function setGameBoardVisibilityFallback(visible) {
  const gameBoard = document.getElementById('game-board');
  if (!gameBoard) return;
  gameBoard.style.display = visible ? 'grid' : 'none';
  gameBoard.classList.toggle('is-idle', !visible);
}

function updateHeroSectionFallback() {
  if (typeof window.__tugwarUpdateHeroSection === 'function') {
    window.__tugwarUpdateHeroSection();
  }
}

function setGameBoardVisibleFromStart(visible) {
  if (typeof window.__tugwarSetGameBoardVisible === 'function') {
    window.__tugwarSetGameBoardVisible(visible);
    return;
  }
  setGameBoardVisibilityFallback(visible);
}

function hideGameResultOverlayFallback() {
  const gameResultOverlay = document.getElementById('game-result-overlay');
  const gameResultActions = document.getElementById('game-result-actions');
  if (gameResultOverlay) {
    gameResultOverlay.hidden = true;
  }
  if (gameResultActions) {
    gameResultActions.hidden = true;
  }
  activeGameResultKey = null;
}

function syncGameResultOverlayFallback() {
  const gameResultOverlay = document.getElementById('game-result-overlay');
  const gameResultKicker = document.getElementById('game-result-kicker');
  const gameResultTitle = document.getElementById('game-result-title');
  const gameResultMessage = document.getElementById('game-result-message');
  const gameResultActions = document.getElementById('game-result-actions');

  if (!gameResultOverlay || !gameState.matchStarted || gameState.gameActive || !gameState.gameOver) {
    hideGameResultOverlayFallback();
    return;
  }

  const resultKey = `${gameState.playMode}:${gameState.winner}:${gameState.teamScores.join('-')}`;
  if (!gameResultOverlay.hidden && activeGameResultKey === resultKey) {
    return;
  }

  if (gameResultActions) {
    gameResultActions.hidden = gameState.playMode !== 'diff';
  }

  if (gameState.winner === null) {
    if (gameResultKicker) gameResultKicker.textContent = 'Match Finished';
    if (gameResultTitle) gameResultTitle.textContent = 'Match Draw';
    if (gameResultMessage) gameResultMessage.textContent = 'Both teams finished even. Match Draw.';
  } else {
    const winnerName = gameState.teamNames[gameState.winner] || `Team ${gameState.winner + 1}`;
    if (gameResultKicker) gameResultKicker.textContent = winnerName;
    if (gameResultTitle) gameResultTitle.textContent = 'Congratulations';
    if (gameResultMessage) gameResultMessage.textContent = `${winnerName} wins the match.`;
  }

  activeGameResultKey = resultKey;
  gameResultOverlay.hidden = false;
}

function clearLiveMatchState() {
  if (gameState.gameTimer) {
    clearInterval(gameState.gameTimer);
    gameState.gameTimer = null;
  }
  if (gameState.questionTimer) {
    clearInterval(gameState.questionTimer);
    gameState.questionTimer = null;
  }

  gameState.gameActive = false;
  gameState.matchStarted = false;
  gameState.gameOver = false;
  gameState.winner = null;
  gameState.tiebreakerActive = false;
  gameState.tiebreakerAnswered = [false, false];
  gameState.questionAttemptedBy = [false, false];
  gameState.currentQuestion = [null, null];
  gameState.currentAnswer = ['', ''];
  gameState.questionTimeLeft = [0, 0];
  gameState.revealedAnswer = null;
  gameState.revealAnswerTimeLeft = 0;
  gameState.pendingNextTeam = null;
}

function dismissGameResultOverlay() {
  clearLiveMatchState();
  hideGameResultOverlayFallback();
}

function startGame() {
  hideGameResultOverlayFallback();
  gameState.matchStarted = false;
  // Always use fallback values for team names and player names
  if (gameState.playMode === 'same') {
    const team1NameInput = document.getElementById('team1-name');
    const team2NameInput = document.getElementById('team2-name');
    gameState.teamNames[0] = (team1NameInput && team1NameInput.value) ? team1NameInput.value : 'Team 1';
    gameState.teamNames[1] = (team2NameInput && team2NameInput.value) ? team2NameInput.value : 'Team 2';
    updateHeroSectionFallback();
    const team1Players = getTeam1PlayersDiv();
    const team2Players = getTeam2PlayersDiv();
    gameState.playerNames[0] = team1Players ? Array.from(team1Players.querySelectorAll('input')).map((i, idx) => i.value || (idx === 0 ? 'A' : 'B')) : ['A', 'B'];
    gameState.playerNames[1] = team2Players ? Array.from(team2Players.querySelectorAll('input')).map((i, idx) => i.value || (idx === 0 ? 'C' : 'D')) : ['C', 'D'];
    gameState.teamScores[0] = 0; gameState.teamScores[1] = 0;
    gameState.teamDifficulty[0] = gameState.selectedLevel; gameState.teamDifficulty[1] = gameState.selectedLevel;
    gameState.currentPlayer[0] = 0; gameState.currentPlayer[1] = 0;
    gameState.currentQuestion[0] = null; gameState.currentQuestion[1] = null;
    gameState.currentAnswer[0] = '';
    gameState.currentAnswer[1] = '';
    gameState.questionTimeLeft[0] = 0; gameState.questionTimeLeft[1] = 0;
    gameState.teamTimeLeft[0] = 150; gameState.teamTimeLeft[1] = 150;
    gameState.gameActive = true;
    gameState.matchStarted = false;
    gameState.winner = null;
    gameState.gameOver = false;
    if (gameState.gameTimer) clearInterval(gameState.gameTimer);
    gameState.currentTeam = 0;
    gameState.gameTimer = setInterval(() => {
      const nextState = tickGameSnapshot(gameState);
      applyGameSnapshot(nextState);
      if (!gameState.gameActive) {
        clearInterval(gameState.gameTimer);
        gameState.gameTimer = null;
      }
      drawGame(!gameState.gameActive);
      syncArenaDecorations();
    }, 1000);
    nextQuestion(gameState.currentTeam);
    gameState.matchStarted = true;
    drawGame();
    syncArenaDecorations();
    // Show answer input area
    const answerArea = document.getElementById('answer-area');
    if (answerArea) answerArea.style.display = '';
    setGameBoardVisibleFromStart(true);
    const answerInput = document.getElementById('answer-input');
    if (answerInput) answerInput.value = '';

  } else if (gameState.playMode === 'diff') {
    const t = gameState.selectedTeam;
    const teamNameInput = document.getElementById(t === 0 ? 'team1-name' : 'team2-name');
    gameState.teamNames[t] = (teamNameInput && teamNameInput.value) ? teamNameInput.value : (t === 0 ? 'Team 1' : 'Team 2');
    const teamPlayersDiv = t === 0 ? getTeam1PlayersDiv() : getTeam2PlayersDiv();
    gameState.playerNames[t] = teamPlayersDiv ? Array.from(teamPlayersDiv.querySelectorAll('input')).map(i => i.value || 'Player') : ['Player 1', 'Player 2'];
    gameState.teamScores[t] = 0;
    gameState.teamDifficulty[t] = gameState.selectedLevel;
    gameState.currentPlayer[t] = 0;
    gameState.currentQuestion[t] = null;
    gameState.currentAnswer[t] = '';
    gameState.questionTimeLeft[t] = 0;
    gameState.teamTimeLeft[t] = 150;
    gameState.gameActive = true;
    gameState.matchStarted = false;
    gameState.winner = null;
    gameState.gameOver = false;
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
      syncArenaDecorations();
    }, 1000);
    nextQuestion(t);
    gameState.matchStarted = true;
    drawGame();
    syncArenaDecorations();
    // Show answer input area
    const answerArea = document.getElementById('answer-area');
    if (answerArea) answerArea.style.display = '';
    setGameBoardVisibleFromStart(true);
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
    const answerResult = document.getElementById('answer-result');
    const answerSubmitted = document.getElementById('answer-submitted');
    const answerSign = document.getElementById('answer-sign');
    const quickAnswerControls = document.getElementById('quick-answer-controls');
    const team1QuickAnswerBtn = document.getElementById('team1-quick-answer-btn');
    const team2QuickAnswerBtn = document.getElementById('team2-quick-answer-btn');
    const welcomeScreen = document.getElementById('welcome-screen');
    const infoScreen = document.getElementById('info-screen');
    const welcomeStartBtn = document.getElementById('welcome-start-btn');
    const howToPlayBtn = document.getElementById('how-to-play-btn');
    const rulesBtn = document.getElementById('rules-btn');
    const infoBackBtn = document.getElementById('info-back-btn');
    const infoStartBtn = document.getElementById('info-start-btn');
    const levelSelectSection = document.getElementById('level-select');
    const infoKicker = document.getElementById('info-kicker');
    const infoTitle = document.getElementById('info-title');
    const infoBody = document.getElementById('info-body');
    const homeBtn = document.getElementById('home-btn');
    const gameAreaSection = document.getElementById('game-area');
    const gameBoard = document.getElementById('game-board');
    let answerResultTimer = null;

    const infoContent = {
      howToPlay: {
        kicker: 'How to Play',
        title: 'How the match flows',
        body: [
          'Tap Start Game, choose a level, then pick Same Device or Different Devices.',
          'In Same Device mode, set both team names and players, then start the round.',
          'Only the team whose turn it is can answer, and only that team\'s timer is used.',
          'Type the answer into the active calculator display and press the team\'s answer button.',
          'Correct answers pull the rope toward that team. Wrong answers pass the turn across.'
        ]
      },
      rules: {
        kicker: 'Rules',
        title: 'Scoring and winning',
        body: [
          'Each correct answer gives 5 points.',
          'Each wrong answer removes 5 points, but scores never go below 0.',
          'If a team runs out of answer time, it loses 1 point and the turn passes on.',
          'The first team to reach 60 points wins the match.',
          'If time runs out for both teams with equal scores, the game goes to a quick answer round.',
          'The rope position reflects the score difference between the two teams.'
        ]
      }
    };

    function getTeamDisplay(teamIdx) {
      return document.getElementById(teamIdx === 0 ? 'team1-answer-display' : 'team2-answer-display');
    }

    function getEffectiveTeam(teamOverride = null) {
      if (teamOverride !== null && teamOverride !== undefined) {
        return teamOverride;
      }
      if (gameState.playMode === 'diff') {
        return gameState.selectedTeam;
      }
      return gameState.currentTeam;
    }

    function syncCalculatorDisplays() {
      for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
        const display = getTeamDisplay(teamIdx);
        if (!display) continue;
        if (display.value !== (gameState.currentAnswer[teamIdx] || '')) {
          display.value = gameState.currentAnswer[teamIdx] || '';
        }
      }
    }

    function isTeamInteractive(teamIdx) {
      if (!gameState.gameActive) return false;
      if (gameState.playMode === 'diff') {
        return teamIdx === gameState.selectedTeam && (gameState.tiebreakerActive || gameState.currentTeam === teamIdx);
      }
      if (gameState.tiebreakerActive) {
        return !gameState.tiebreakerAnswered[teamIdx];
      }
      return gameState.currentTeam === teamIdx;
    }

    function syncCalculatorUi() {
      syncCalculatorDisplays();
      const team1Card = document.getElementById('team1-card');
      const team2Card = document.getElementById('team2-card');
      const team1TurnPill = document.getElementById('team1-turn-pill');
      const team2TurnPill = document.getElementById('team2-turn-pill');
      const cards = [team1Card, team2Card];
      const pills = [team1TurnPill, team2TurnPill];

      for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
        const active = isTeamInteractive(teamIdx);
        const display = getTeamDisplay(teamIdx);
        cards[teamIdx]?.classList.toggle('is-active', active);
        cards[teamIdx]?.classList.toggle('is-disabled', !active);
        cards[teamIdx]?.classList.toggle('current', !gameState.tiebreakerActive && gameState.currentTeam === teamIdx && gameState.gameActive);
        if (display) {
          display.readOnly = !active;
        }
        if (pills[teamIdx]) {
          pills[teamIdx].classList.toggle('is-active', active);
          pills[teamIdx].classList.toggle('is-locked', !active);
          pills[teamIdx].textContent = !gameState.gameActive
            ? 'Round complete'
            : gameState.tiebreakerActive
              ? (gameState.tiebreakerAnswered[teamIdx] ? 'Answer locked' : 'Quick answer round')
              : active
                ? 'Your turn to answer'
                : 'Waiting for turn';
        }
      }
    }

    function updateCalculatorEntry(teamIdx, nextValue) {
      const normalizedValue = String(nextValue ?? '').replace(/[^0-9-]/g, '');
      const compactValue = normalizedValue.startsWith('-')
        ? `-${normalizedValue.slice(1).replace(/-/g, '')}`
        : normalizedValue.replace(/-/g, '');
      gameState.currentAnswer[teamIdx] = compactValue;
      if (answerInput && teamIdx === getEffectiveTeam(teamIdx)) {
        answerInput.value = compactValue;
      }
      syncCalculatorDisplays();
    }

    function resetDisplayedAnswers() {
      gameState.currentAnswer = ['', ''];
      if (answerInput) answerInput.value = '';
      syncCalculatorUi();
    }

    function setGameBoardVisible(visible) {
      if (!gameBoard) return;
      gameBoard.style.display = visible ? 'grid' : 'none';
      gameBoard.classList.toggle('is-idle', !visible);
    }

    window.__tugwarSetGameBoardVisible = setGameBoardVisible;

    function resetPreGamePanels() {
      if (levelSelectSection) levelSelectSection.style.display = 'none';
      if (modeSelectDiv) modeSelectDiv.style.display = 'none';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (newGameBtn) newGameBtn.style.display = 'none';
      if (answerArea) answerArea.style.display = 'none';
      if (gameCanvas) gameCanvas.style.display = 'none';
      setGameBoardVisible(false);
    }

    function showWelcomeScreen() {
      if (welcomeScreen) welcomeScreen.style.display = '';
      if (infoScreen) infoScreen.style.display = 'none';
      if (gameAreaSection) gameAreaSection.style.display = 'none';
      resetPreGamePanels();
    }

    function showGameArea() {
      if (welcomeScreen) welcomeScreen.style.display = 'none';
      if (infoScreen) infoScreen.style.display = 'none';
      if (gameAreaSection) gameAreaSection.style.display = '';
    }

    function openInfoScreen(kind) {
      const content = infoContent[kind];
      if (!content || !infoScreen || !infoBody) return;
      if (welcomeScreen) welcomeScreen.style.display = 'none';
      if (gameAreaSection) gameAreaSection.style.display = 'none';
      infoScreen.style.display = '';
      if (infoKicker) infoKicker.textContent = content.kicker;
      if (infoTitle) infoTitle.textContent = content.title;
      infoBody.innerHTML = content.body.map((item) => `<p>${item}</p>`).join('');
    }

    function showModeSelection() {
      showGameArea();
      if (levelSelectSection) levelSelectSection.style.display = 'none';
      if (modeSelectDiv) modeSelectDiv.style.display = '';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (answerArea) answerArea.style.display = 'none';
      setGameBoardVisible(false);
    }

    function showLevelSelection() {
      showGameArea();
      if (levelSelectSection) levelSelectSection.style.display = '';
      if (modeSelectDiv) modeSelectDiv.style.display = 'none';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (answerArea) answerArea.style.display = 'none';
      setGameBoardVisible(false);
    }

    function showSameDeviceSetup() {
      showGameArea();
      if (modeSelectDiv) modeSelectDiv.style.display = 'none';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = '';
      if (answerArea) answerArea.style.display = 'none';
      setGameBoardVisible(false);
    }

    function showAnswerResult(message, signText = '', signClass = '') {
      if (!answerResult || !answerSubmitted || !answerSign) return;
      if (answerResultTimer) {
        clearTimeout(answerResultTimer);
        answerResultTimer = null;
      }
      answerResult.style.display = 'block';
      answerSubmitted.textContent = message;
      answerSign.textContent = signText;
      answerSign.className = signClass;
    }

    function hideAnswerResult() {
      if (!answerResult) return;
      if (answerResultTimer) {
        clearTimeout(answerResultTimer);
        answerResultTimer = null;
      }
      answerResult.style.display = 'none';
      if (answerSubmitted) answerSubmitted.textContent = '';
      if (answerSign) {
        answerSign.textContent = '';
        answerSign.className = '';
      }
    }

    function updateAnswerControls() {
      if (!answerInput || !submitAnswerBtn || !quickAnswerControls) return;
      const isSameDeviceQuickRound = gameState.playMode === 'same' && gameState.tiebreakerActive;
      quickAnswerControls.style.display = isSameDeviceQuickRound ? 'flex' : 'none';
      submitAnswerBtn.style.display = isSameDeviceQuickRound ? 'none' : '';
      if (gameState.revealedAnswer) {
        showAnswerResult(`Correct answer: ${gameState.revealedAnswer.answer}`);
      }
      if (!gameState.revealedAnswer && !gameState.tiebreakerActive && answerResult && answerResult.textContent.startsWith('Correct answer:')) {
        hideAnswerResult();
      }
      if (gameState.playMode === 'same') {
        answerInput.disabled = false;
        answerInput.placeholder = gameState.tiebreakerActive ? 'Type the answer, then choose the team below...' : 'Type your answer...';
      }
      syncCalculatorUi();
    }

    async function submitAnswer(teamOverride = null) {
      if (!gameState.gameActive) return;
      if (!answerInput) return;
      const effectiveTeam = getEffectiveTeam(teamOverride);
      if (effectiveTeam === null || effectiveTeam === undefined) return;
      answerInput.value = gameState.currentAnswer[effectiveTeam] || '';
      const ans = answerInput.value.trim();
      if (ans === '') return;
      if (gameState.playMode === 'diff') {
        const answeringTeam = gameState.selectedTeam;
        const isCorrect = String(ans).trim() === String(gameState.currentQuestion[answeringTeam]?.ans || gameState.currentQuestion[0]?.ans);
        playFeedbackSound(isCorrect ? 'clap' : 'aw');
        await submitMultiplayerAnswer(ans);
        gameState.currentAnswer[answeringTeam] = '';
        answerInput.value = '';
        syncCalculatorUi();
        answerInput.blur();
        return;
      }
      const teamIdx = gameState.tiebreakerActive ? teamOverride : gameState.currentTeam;
      if (teamIdx === null || teamIdx === undefined) return;
      const questionObj = gameState.currentQuestion[teamIdx];
      const correctAns = questionObj?.ans;
      const correct = (ans !== null && String(ans).trim() === String(correctAns));
      playFeedbackSound(correct ? 'clap' : 'aw');
      showAnswerResult(`You answered: ${ans}`, correct ? '✔' : '✖', correct ? 'correct' : 'wrong');
      handleAnswer(ans, teamIdx);
      gameState.currentAnswer[teamIdx] = '';
      answerInput.value = '';
      syncCalculatorUi();
      if (!gameState.revealedAnswer) {
        answerResultTimer = setTimeout(() => {
          if (!gameState.revealedAnswer) {
            hideAnswerResult();
          }
        }, 1200);
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
    if (team1QuickAnswerBtn) {
      team1QuickAnswerBtn.addEventListener('click', function() {
        submitAnswer(0);
      });
    }
    if (team2QuickAnswerBtn) {
      team2QuickAnswerBtn.addEventListener('click', function() {
        submitAnswer(1);
      });
    }
    document.querySelectorAll('.calculator-display').forEach((display, index) => {
      display.addEventListener('focus', function() {
        if (!isTeamInteractive(index)) {
          display.blur();
          return;
        }
        if (answerInput) {
          answerInput.value = gameState.currentAnswer[index] || '';
        }
      });

      display.addEventListener('input', function() {
        if (!isTeamInteractive(index)) {
          syncCalculatorDisplays();
          return;
        }
        updateCalculatorEntry(index, display.value);
      });

      display.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitAnswer(index);
        }
      });
    });
    document.querySelectorAll('.team-submit-btn').forEach((button) => {
      button.addEventListener('click', function() {
        submitAnswer(Number(button.dataset.team));
      });
    });
    if (welcomeStartBtn) {
      welcomeStartBtn.addEventListener('click', function() {
        showLevelSelection();
      });
    }
    if (howToPlayBtn) {
      howToPlayBtn.addEventListener('click', function() {
        openInfoScreen('howToPlay');
      });
    }
    if (rulesBtn) {
      rulesBtn.addEventListener('click', function() {
        openInfoScreen('rules');
      });
    }
    if (infoBackBtn) {
      infoBackBtn.addEventListener('click', function() {
        showWelcomeScreen();
      });
    }
    if (infoStartBtn) {
      infoStartBtn.addEventListener('click', function() {
        showLevelSelection();
      });
    }

    document.querySelectorAll('.level-card').forEach((button) => {
      button.addEventListener('click', function() {
        gameState.selectedLevel = Number(button.dataset.level || 0);
        showModeSelection();
      });
    });
    if (homeBtn) {
      homeBtn.addEventListener('click', async function() {
        await leaveCurrentLobbyTeam();
        stopSessionSync();
        stopLobbyExpiryWatcher();
        if (stopLobbySubscription) {
          stopLobbySubscription();
          stopLobbySubscription = null;
        }
        resetGameState();
        resetDisplayedAnswers();
        if (modeSelectDiv) modeSelectDiv.style.display = '';
        if (lobbyPanel) lobbyPanel.style.display = 'none';
        if (teamForm) teamForm.style.display = 'none';
        if (gameCanvas) gameCanvas.style.display = 'none';
        if (newGameBtn) newGameBtn.style.display = 'none';
        setGameBoardVisible(false);
        showWelcomeScreen();
        hideGameResultOverlay();
        updateHeroSection();
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
        const questionDisplay = document.getElementById('question-display');
        const questionTimer = document.getElementById('question-timer');
        const team1Card = document.getElementById('team1-card');
        const team2Card = document.getElementById('team2-card');
        if (mathCurrentTeam) {
          if (gameState.tiebreakerActive) {
            mathCurrentTeam.textContent = 'Quick Answer Round';
            mathCurrentTeam.classList.remove('team1', 'team2');
          } else if (gameState.revealedAnswer) {
            mathCurrentTeam.textContent = 'Answer Reveal';
            mathCurrentTeam.classList.remove('team1', 'team2');
          } else {
            const teamIdx = gameState.currentTeam;
            mathCurrentTeam.textContent = `Current: ${gameState.teamNames[teamIdx] || 'Team ' + (teamIdx+1)}`;
            mathCurrentTeam.classList.remove('team1', 'team2');
            mathCurrentTeam.classList.add(teamIdx === 0 ? 'team1' : 'team2');
          }
        }
    const displayTeam = gameState.tiebreakerActive ? 0 : gameState.currentTeam;
    if (questionDisplay) {
      if (!gameState.gameActive && gameState.revealedAnswer) {
        questionDisplay.textContent = `${gameState.revealedAnswer.question} = ${gameState.revealedAnswer.answer}`;
      } else if (gameState.revealedAnswer) {
        questionDisplay.textContent = `${gameState.revealedAnswer.question} = ${gameState.revealedAnswer.answer}`;
      } else if (gameState.currentQuestion[displayTeam]?.q) {
        questionDisplay.textContent = gameState.currentQuestion[displayTeam].q;
      } else if (gameState.matchStarted && gameState.gameOver) {
        const winningTeam = gameState.teamScores[0] === gameState.teamScores[1]
          ? 'Draw Game'
          : `${gameState.teamNames[gameState.teamScores[0] > gameState.teamScores[1] ? 0 : 1]} Wins`;
        questionDisplay.textContent = winningTeam;
      } else {
        questionDisplay.textContent = 'Pick a mode to begin.';
      }
    }
    if (questionTimer) {
      const timeValue = gameState.revealedAnswer
        ? gameState.revealAnswerTimeLeft
        : gameState.questionTimeLeft[displayTeam];
      questionTimer.textContent = `Time Left: ${Number.isFinite(timeValue) ? timeValue : '--'}s`;
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
      if (gameState.tiebreakerActive) {
        heroCurrentTeam.textContent = 'Quick Answer Round';
      } else if (gameState.revealedAnswer) {
        heroCurrentTeam.textContent = 'Answer Reveal';
      } else {
        const teamIdx = gameState.currentTeam;
        heroCurrentTeam.textContent = `Current: ${gameState.teamNames[teamIdx] || 'Team ' + (teamIdx+1)}`;
      }
    }
    team1Card?.classList.toggle('current', gameState.gameActive && !gameState.tiebreakerActive && gameState.currentTeam === 0);
    team2Card?.classList.toggle('current', gameState.gameActive && !gameState.tiebreakerActive && gameState.currentTeam === 1);
    syncGameResultOverlayFallback();
  }

  window.__tugwarUpdateHeroSection = updateHeroSection;

  function syncArenaDecorations() {
    updateHeroSection();
    if (typeof updateAnswerControls === 'function') {
      updateAnswerControls();
    }
    if (typeof setRopePosition === 'function' && gameState.teamScores) {
      const maxScore = 50;
      const diff = gameState.teamScores[0] - gameState.teamScores[1];
      let pos = diff / maxScore;
      pos = Math.max(-1, Math.min(1, pos));
      setRopePosition(pos);
    }
    const ropeTeam1 = document.getElementById('rope-team1-label');
    const ropeTeam2 = document.getElementById('rope-team2-label');
    if (ropeTeam1) ropeTeam1.textContent = gameState.teamNames[0] || 'Team 1';
    if (ropeTeam2) ropeTeam2.textContent = gameState.teamNames[1] || 'Team 2';
  }

  // Update hero section every second and after game state changes
  setInterval(updateHeroSection, 1000);
  // Also update after every drawGame
  const origDrawGame = window.drawGame || drawGame;
  const enhancedDrawGame = function(gameOver) {
    origDrawGame(gameOver);
    syncArenaDecorations();
  };
  window.drawGame = enhancedDrawGame;
  syncArenaDecorations();
  const sidebarNewGameBtn = document.getElementById('sidebar-new-game-btn');
    if (sidebarNewGameBtn) {
      sidebarNewGameBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        await leaveCurrentLobbyTeam();
        stopSessionSync();
        stopLobbyExpiryWatcher();
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
        resetDisplayedAnswers();
        setGameBoardVisible(false);
        showWelcomeScreen();
        hideGameResultOverlay();
        updateHeroSection();
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
  const gameResultOverlay = document.getElementById('game-result-overlay');
  const gameResultKicker = document.getElementById('game-result-kicker');
  const gameResultTitle = document.getElementById('game-result-title');
  const gameResultMessage = document.getElementById('game-result-message');
  const gameResultActions = document.getElementById('game-result-actions');
  const gameResultRestartBtn = document.getElementById('game-result-restart-btn');
  const gameResultHomeBtn = document.getElementById('game-result-home-btn');
  const gameResultLobbyBtn = document.getElementById('game-result-lobby-btn');
  const gameResultLeaveBtn = document.getElementById('game-result-leave-btn');
  const gameResultExitBtn = document.getElementById('game-result-exit-btn');
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

  function describeLobbyError(error, fallbackMessage) {
    const errorCode = error?.code || '';
    if (errorCode === 'auth/operation-not-allowed' || errorCode === 'auth/admin-restricted-operation') {
      return 'Firebase anonymous sign-in is disabled. Enable Anonymous auth in Firebase Authentication.';
    }
    if (errorCode === 'auth/unauthorized-domain') {
      return 'This site domain is not authorized in Firebase Authentication. Add the current domain under Authentication > Settings > Authorized domains.';
    }
    if (errorCode === 'PERMISSION_DENIED' || errorCode === 'permission-denied' || errorCode === 'database/permission-denied') {
      return 'Firebase Database denied access. Publish the Realtime Database rules and make sure anonymous auth is enabled.';
    }
    if (errorCode === 'auth/network-request-failed') {
      return 'Firebase auth request failed. Check your internet connection and Firebase project settings.';
    }
    if (error?.message) {
      return `${fallbackMessage} ${error.message}`;
    }
    return fallbackMessage;
  }

  function setLobbyBackendIndicator() {
    if (!lobbyBackendIndicator) return;
    lobbyBackendIndicator.textContent = getMultiplayerBackendLabel();
  }

  function hideGameResultOverlay() {
    if (!gameResultOverlay) return;
    gameResultOverlay.hidden = true;
    activeGameResultKey = null;
  }

  function showGameResultOverlay() {
    if (!gameResultOverlay || !gameState.matchStarted || gameState.gameActive || !gameState.gameOver) {
      hideGameResultOverlay();
      return;
    }

    const resultKey = `${gameState.playMode}:${gameState.winner}:${gameState.teamScores.join('-')}`;
    if (!gameResultOverlay.hidden && activeGameResultKey === resultKey) {
      return;
    }

    const isDiffMode = gameState.playMode === 'diff';
    if (gameResultActions) {
      gameResultActions.hidden = false;
    }
    if (gameResultRestartBtn) gameResultRestartBtn.hidden = isDiffMode;
    if (gameResultHomeBtn) gameResultHomeBtn.hidden = isDiffMode;
    if (gameResultLobbyBtn) gameResultLobbyBtn.hidden = !isDiffMode;
    if (gameResultLeaveBtn) gameResultLeaveBtn.hidden = !isDiffMode;
    if (gameResultExitBtn) gameResultExitBtn.hidden = !isDiffMode;

    if (gameState.winner === null) {
      gameResultKicker.textContent = 'Match Finished';
      gameResultTitle.textContent = 'Match Draw';
      gameResultMessage.textContent = 'Both teams finished even. Match Draw.';
    } else {
      const winnerName = gameState.teamNames[gameState.winner] || `Team ${gameState.winner + 1}`;
      gameResultKicker.textContent = winnerName;
      gameResultTitle.textContent = 'Congratulations';
      gameResultMessage.textContent = `${winnerName} wins the match.`;
    }

    activeGameResultKey = resultKey;
    gameResultOverlay.hidden = false;
  }

  function stopLobbyExpiryWatcher() {
    if (lobbyExpiryInterval) {
      clearInterval(lobbyExpiryInterval);
      lobbyExpiryInterval = null;
    }
  }

  async function sweepExpiredLobbyMatches() {
    const currentTeamBefore = getCurrentLobbyTeam(currentLobbyState);
    currentLobbyState = await releaseExpiredLobbyMatches();
    const currentTeamAfter = getCurrentLobbyTeam(currentLobbyState);

    if (currentTeamBefore?.status === 'matched' && currentTeamAfter?.status === 'waiting' && !currentTeamAfter.opponentId) {
      setLobbyStatus('Opponent did not respond in time. Your team is back in the lobby.');
    }

    renderLobby();
  }

  function startLobbyExpiryWatcher() {
    stopLobbyExpiryWatcher();
    lobbyExpiryInterval = setInterval(() => {
      sweepExpiredLobbyMatches().catch(() => {});
    }, 5000);
  }

  function getCurrentLobbyTeam(lobbyState = currentLobbyState) {
    const currentTeamId = getCurrentLobbyTeamId();
    return lobbyState.teams.find((team) => team.id === currentTeamId && team.ownerId === sessionOwnerId) || null;
  }

  function syncLobbyStatusFromState(previousLobbyState = null) {
    const currentTeam = getCurrentLobbyTeam(currentLobbyState);
    if (!currentTeam) {
      return;
    }

    const previousTeam = previousLobbyState ? getCurrentLobbyTeam(previousLobbyState) : null;
    const opponentTeam = currentTeam.opponentId
      ? currentLobbyState.teams.find((team) => team.id === currentTeam.opponentId)
      : null;
    const previousOpponent = previousTeam?.opponentId && previousLobbyState
      ? previousLobbyState.teams.find((team) => team.id === previousTeam.opponentId)
      : null;

    if (currentTeam.status === 'matched' && previousTeam?.status !== 'matched' && opponentTeam) {
      setLobbyStatus(`${opponentTeam.name} selected your team. Press Continue to start game setup.`);
      return;
    }

    if (currentTeam.status === 'matched' && currentTeam.setupConfirmed && opponentTeam?.setupConfirmed) {
      setLobbyStatus('2/2 users are ready. Continue to game setup.');
      return;
    }

    if (currentTeam.status === 'matched' && previousOpponent && !previousOpponent.setupConfirmed && opponentTeam?.setupConfirmed && !currentTeam.setupConfirmed) {
      setLobbyStatus(`${opponentTeam.name} is ready. Press Continue to start game setup.`);
    }
  }

  async function leaveCurrentLobbyTeam() {
    const lobbyState = currentLobbyState;
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    if (!currentTeam) {
      setCurrentLobbyTeamId(null);
      return;
    }
    try {
      currentLobbyState = await removeLobbyTeam(currentTeam.id);
      setCurrentLobbyTeamId(null);
    } catch (error) {
      setLobbyStatus(describeLobbyError(error, 'Could not remove your team from the lobby.'));
      throw error;
    }
  }

  async function waitInLobbyAfterGame() {
    dismissGameResultOverlay();
    const currentTeam = getCurrentLobbyTeam(currentLobbyState);
    stopSessionSync();
    if (currentTeam) {
      currentLobbyState = await returnTeamToLobby(currentTeam.id);
    }
    resetGameState();
    resetDisplayedAnswers();
    if (gameCanvas) gameCanvas.style.display = 'none';
    setGameBoardVisible(false);
    openLobbyPanel('Your team is back in the lobby and waiting for a new opponent.');
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

    answerArea.style.display = 'none';

    if (!currentSessionState?.game) {
      answerInput.disabled = true;
      submitBtn.disabled = true;
      answerInput.placeholder = 'Waiting for match to start...';
      return;
    }

    const isMyTurn = currentSessionState.game.gameActive && (currentSessionState.game.tiebreakerActive || currentSessionState.game.currentTeam === gameState.selectedTeam);
    answerInput.disabled = !isMyTurn;
    submitBtn.disabled = !isMyTurn;
    answerInput.placeholder = currentSessionState.game.tiebreakerActive
      ? 'Quick answer round: answer fast!'
      : (isMyTurn ? 'Type your answer...' : 'Waiting for the other team...');
  }

  function isLobbyReadyForDiffSetup(lobbyState = currentLobbyState) {
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    if (!currentTeam || currentTeam.status !== 'matched' || !currentTeam.setupConfirmed || currentTeam.slot === null) {
      return false;
    }
    const opponentTeam = currentTeam.opponentId
      ? lobbyState.teams.find((team) => team.id === currentTeam.opponentId)
      : null;
    return Boolean(opponentTeam?.setupConfirmed);
  }

  function applySessionState(sessionState) {
    currentSessionState = sessionState;
    if (!sessionState?.game) {
      const team0 = sessionState?.teams?.[0] || null;
      const team1 = sessionState?.teams?.[1] || null;
      gameState.teamNames = [team0?.name || 'Team 1', team1?.name || 'Team 2'];
      gameState.playerNames = [team0?.players || ['Player 1', 'Player 2'], team1?.players || ['Player 1', 'Player 2']];
      gameState.matchStarted = false;
      hideGameResultOverlay();
      drawGame(true);
      syncArenaDecorations();
      updateDiffAnswerUi();
      return;
    }

    gameState.playMode = 'diff';
    applyGameSnapshot(sessionState.game);
    modeSelectDiv.style.display = 'none';
    if (lobbyPanel) lobbyPanel.style.display = 'none';
    if (teamForm) teamForm.style.display = 'none';
    if (gameCanvas) {
      gameCanvas.style.display = 'none';
      gameCanvas.width = 700;
      gameCanvas.height = 400;
    }
    if (gameBoard) gameBoard.classList.remove('is-idle');
    setGameBoardVisible(true);
    drawGame(!gameState.gameActive);
    syncArenaDecorations();
    showGameResultOverlay();
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
    try {
      const snapshot = await getSessionSnapshot(sessionId);
      applySessionState(snapshot);
      startHostTickerIfNeeded();
    } catch (error) {
      setLobbyStatus(describeLobbyError(error, 'Could not load the shared match session.'));
      throw error;
    }
  }

  async function ensureSessionStarted(sessionId) {
    currentSessionState = await mutateSessionState(sessionId, (sessionState) => {
      const team0 = sessionState.teams[0];
      const team1 = sessionState.teams[1];
      const bothTeamsReady = Boolean(team0?.ready) && Boolean(team1?.ready);
      const staleFinishedGame = sessionState.status === 'finished' || Boolean(sessionState.game?.gameOver);

      if (!bothTeamsReady) {
        if (!staleFinishedGame) {
          return sessionState;
        }
        return {
          ...sessionState,
          status: 'setup',
          game: null
        };
      }

      if (sessionState.game && !staleFinishedGame) {
        return sessionState;
      }

      return {
        ...sessionState,
        hostOwnerId: sessionState.hostOwnerId || team0.ownerId,
        status: 'active',
        game: buildInitialGameSnapshot(
          [team0.name || 'Team 1', team1.name || 'Team 2'],
          [team0.players || ['Player 1', 'Player 2'], team1.players || ['Player 1', 'Player 2']],
          gameState.selectedLevel
        )
      };
    });
  }

  async function submitMultiplayerAnswer(answerValue) {
    if (!currentSessionId || !currentSessionState?.game?.gameActive) {
      return;
    }
    if (!currentSessionState.game.tiebreakerActive && currentSessionState.game.currentTeam !== gameState.selectedTeam) {
      return;
    }

    currentSessionState = await mutateSessionState(currentSessionId, (sessionState) => {
      if (sessionState.status !== 'active' || !sessionState.game?.gameActive) {
        return sessionState;
      }
      if (!sessionState.game.tiebreakerActive && sessionState.game.currentTeam !== gameState.selectedTeam) {
        return sessionState;
      }
      const nextGame = resolveSubmittedAnswer(sessionState.game, answerValue, gameState.selectedTeam);
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

  function configureSameDeviceTeamForm() {
    const team1NameInput = document.getElementById('team1-name');
    const team2NameInput = document.getElementById('team2-name');
    if (!team1NameInput || !team2NameInput) return;

    if (team1Card) team1Card.style.display = '';
    if (team2Card) team2Card.style.display = '';
    team1NameInput.disabled = false;
    team2NameInput.disabled = false;
    team1NameInput.required = false;
    team2NameInput.required = false;
    if (!team1NameInput.value.trim()) team1NameInput.value = 'Team 1';
    if (!team2NameInput.value.trim()) team2NameInput.value = 'Team 2';

    [team1PlayersDiv, team2PlayersDiv].forEach((playersDiv, teamIdx) => {
      playersDiv.style.display = '';
      Array.from(playersDiv.querySelectorAll('input')).forEach((input, playerIdx) => {
        input.disabled = false;
        input.required = false;
        if (!input.value.trim()) {
          input.value = `Player ${teamIdx * 2 + playerIdx + 1}`;
        }
      });
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
    if (!currentTeam.setupConfirmed || !opponentTeam.setupConfirmed) {
      const confirmedCount = Number(Boolean(currentTeam.setupConfirmed)) + Number(Boolean(opponentTeam.setupConfirmed));
      setLobbyStatus(`${confirmedCount}/2 users are ready to continue. Both teams must press continue.`);
      renderLobby();
      return;
    }

    gameState.playMode = 'diff';
    gameState.selectedTeam = currentTeam.slot;
    gameState.teamNames[currentTeam.slot] = currentTeam.name;
    gameState.teamNames[1 - currentTeam.slot] = opponentTeam.name;
    clearLiveMatchState();
    hideGameResultOverlay();

    const team1NameInput = document.getElementById('team1-name');
    const team2NameInput = document.getElementById('team2-name');
    if (team1NameInput) team1NameInput.value = gameState.teamNames[0];
    if (team2NameInput) team2NameInput.value = gameState.teamNames[1];
    currentSessionId = currentTeam.sessionId || null;

    modeSelectDiv.style.display = 'none';
    stopLobbyExpiryWatcher();
    if (lobbyPanel) lobbyPanel.style.display = 'none';
    teamForm.style.display = '';
    gameCanvas.style.display = 'none';
    hideFormError();
    configureDiffTeamForm(currentTeam.slot);
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
        difficulty: gameState.selectedLevel,
        updatedAt: now
      };
    } else {
      teamToSave = {
        id: createSessionId('team'),
        ownerId: sessionOwnerId,
        name: requestedName,
        difficulty: gameState.selectedLevel,
        status: 'waiting',
        opponentId: null,
        slot: null,
        createdAt: now,
        updatedAt: now
      };
      setCurrentLobbyTeamId(teamToSave.id);
    }

    try {
      currentLobbyState = await saveLobbyTeam(teamToSave);
      setLobbyStatus('Your team is in the lobby and waiting for an opponent.');
      renderLobby();
    } catch (error) {
      if (!currentTeam) {
        setCurrentLobbyTeamId(null);
      }
      setLobbyStatus(describeLobbyError(error, 'Could not save your team to Firebase.'));
      console.error('Failed to save lobby team:', error);
    }
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

    try {
      currentLobbyState = await matchLobbyTeams(currentTeam.id, opponentTeam.id);
    } catch (error) {
      setLobbyStatus(describeLobbyError(error, 'Could not match teams in Firebase.'));
      console.error('Failed to match teams:', error);
      return;
    }
    const matchedOpponent = currentLobbyState.teams.find((team) => team.id === opponentTeam.id);
    if (!matchedOpponent || matchedOpponent.status !== 'matched') {
      setLobbyStatus('That team was just selected by someone else. Pick another waiting team.');
      renderLobby();
      return;
    }

    setLobbyStatus(`Matched with ${opponentTeam.name}. Both users must press continue to reach game setup.`);
    renderLobby();
  }

  async function confirmLobbyContinuation() {
    const currentTeam = getCurrentLobbyTeam(currentLobbyState);
    if (!currentTeam || currentTeam.status !== 'matched') {
      setLobbyStatus('Match your team with an opponent before continuing.');
      return;
    }

    try {
      currentLobbyState = await setLobbyTeamSetupConfirmed(currentTeam.id, true);
    } catch (error) {
      setLobbyStatus(describeLobbyError(error, 'Could not update continue confirmation.'));
      return;
    }

    const freshCurrentTeam = getCurrentLobbyTeam(currentLobbyState);
    const opponentTeam = freshCurrentTeam?.opponentId
      ? currentLobbyState.teams.find((team) => team.id === freshCurrentTeam.opponentId)
      : null;
    const confirmedCount = Number(Boolean(freshCurrentTeam?.setupConfirmed)) + Number(Boolean(opponentTeam?.setupConfirmed));

    if (freshCurrentTeam?.setupConfirmed && opponentTeam?.setupConfirmed) {
      setLobbyStatus('2/2 users are ready. Continue to game setup.');
      renderLobby();
      await openDiffTeamSetup();
      return;
    } else {
      setLobbyStatus(`${confirmedCount}/2 users are ready to continue.`);
    }
    renderLobby();
  }

  function renderLobby() {
    if (!lobbyPanel || !lobbyMyTeam || !lobbyTeamsList) return;

    const lobbyState = currentLobbyState;
    const currentTeam = getCurrentLobbyTeam(lobbyState);
    const selectedDifficulty = Number(gameState.selectedLevel || 0);
    const getDifficultyLabel = (difficultyIndex) => DIFFICULTY[Number(difficultyIndex ?? 0)]?.name || 'Basic';
    const waitingTeams = lobbyState.teams
      .filter((team) => team.status === 'waiting' && team.id !== currentTeam?.id && Number(team.difficulty ?? 0) === selectedDifficulty)
      .sort((teamA, teamB) => teamA.name.localeCompare(teamB.name, undefined, { sensitivity: 'base' }));
    const totalWaitingPages = Math.max(1, Math.ceil(waitingTeams.length / LOBBY_WAITING_TEAMS_PER_PAGE));
    lobbyWaitingTeamsPage = Math.min(lobbyWaitingTeamsPage, totalWaitingPages);
    lobbyWaitingTeamsPage = Math.max(1, lobbyWaitingTeamsPage);
    const waitingTeamsStart = (lobbyWaitingTeamsPage - 1) * LOBBY_WAITING_TEAMS_PER_PAGE;
    const visibleWaitingTeams = waitingTeams.slice(waitingTeamsStart, waitingTeamsStart + LOBBY_WAITING_TEAMS_PER_PAGE);

    if (lobbyTeamNameInput && currentTeam && !lobbyTeamNameInput.value) {
      lobbyTeamNameInput.value = currentTeam.name;
    }

    if (!currentTeam) {
      lobbyMyTeam.innerHTML = '<p class="lobby-empty">No team created yet.</p>';
    } else {
      const opponentTeam = currentTeam.opponentId ? lobbyState.teams.find((team) => team.id === currentTeam.opponentId) : null;
      const setupReadyCount = Number(Boolean(currentTeam.setupConfirmed)) + Number(Boolean(opponentTeam?.setupConfirmed));
      const readySummary = currentTeam.status === 'matched' && opponentTeam
        ? `
          <div class="lobby-ready-status-list">
            <div class="lobby-ready-status-row">
              <span class="lobby-ready-name">${currentTeam.name}</span>
              <span class="lobby-ready-badge${currentTeam.setupConfirmed ? ' ready' : ''}">${currentTeam.setupConfirmed ? 'Ready' : 'Waiting'}</span>
            </div>
            <div class="lobby-ready-status-row">
              <span class="lobby-ready-name">${opponentTeam.name}</span>
              <span class="lobby-ready-badge${opponentTeam.setupConfirmed ? ' ready' : ''}">${opponentTeam.setupConfirmed ? 'Ready' : 'Waiting'}</span>
            </div>
          </div>`
        : '';
      const actionButton = currentTeam.status === 'matched'
        ? `
          <button type="button" id="lobby-continue-btn">${setupReadyCount === 2 ? 'Continue to Game Setup' : 'Press Continue'}</button>
          <div class="lobby-ready-counter">${setupReadyCount}/2 users ready to continue</div>
          ${readySummary}`
        : '<button type="button" id="lobby-remove-team-btn" class="lobby-secondary-btn">Remove Team</button>';

      lobbyMyTeam.innerHTML = `
        <article class="lobby-card">
          <div class="lobby-card-header">
            <div class="lobby-team-heading">
              <span class="lobby-team-title">${currentTeam.name}</span>
              <span class="lobby-difficulty-badge">${getDifficultyLabel(currentTeam.difficulty)}</span>
            </div>
            <span class="lobby-badge${currentTeam.status === 'matched' ? ' matched' : ''}">${currentTeam.status === 'matched' ? 'Matched' : 'Waiting'}</span>
          </div>
          <div>${currentTeam.status === 'matched' && opponentTeam ? `Opponent selected: <strong>${opponentTeam.name}</strong>` : 'Waiting for another team to choose this matchup.'}</div>
          <div class="lobby-card-actions">${actionButton}</div>
        </article>`;
    }

    if (!waitingTeams.length) {
      lobbyWaitingTeamsPage = 1;
      lobbyTeamsList.innerHTML = '<p class="lobby-empty">No teams are waiting for this difficulty right now.</p>';
    } else {
      const waitingTeamsSummary = `Showing ${waitingTeamsStart + 1}-${Math.min(waitingTeamsStart + visibleWaitingTeams.length, waitingTeams.length)} of ${waitingTeams.length} teams`;
      const paginationControls = totalWaitingPages > 1
        ? `
          <div class="lobby-pagination">
            <div class="lobby-pagination-summary">${waitingTeamsSummary}</div>
            <div class="lobby-pagination-actions">
              <button type="button" id="lobby-page-prev-btn" class="lobby-secondary-btn" ${lobbyWaitingTeamsPage === 1 ? 'disabled' : ''}>Previous</button>
              <span class="lobby-pagination-page">Page ${lobbyWaitingTeamsPage} of ${totalWaitingPages}</span>
              <button type="button" id="lobby-page-next-btn" class="lobby-secondary-btn" ${lobbyWaitingTeamsPage === totalWaitingPages ? 'disabled' : ''}>Next</button>
            </div>
          </div>`
        : `<div class="lobby-pagination lobby-pagination-single"><div class="lobby-pagination-summary">${waitingTeamsSummary}</div></div>`;

      lobbyTeamsList.innerHTML = visibleWaitingTeams.map((team) => `
        <article class="lobby-card">
          <div class="lobby-card-header">
            <div class="lobby-team-heading">
              <span class="lobby-team-title">${team.name}</span>
              <span class="lobby-difficulty-badge">${getDifficultyLabel(team.difficulty)}</span>
            </div>
            <span class="lobby-badge">Waiting</span>
          </div>
          <div>Available to be selected as your opponent.</div>
          <div class="lobby-card-actions">
            <button type="button" class="lobby-select-team-btn" data-team-id="${team.id}" ${currentTeam && currentTeam.status === 'waiting' ? '' : 'disabled'}>Play This Team</button>
          </div>
        </article>`).join('') + paginationControls;
    }

    const continueBtn = document.getElementById('lobby-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', async function() {
        const currentTeam = getCurrentLobbyTeam(currentLobbyState);
        const opponentTeam = currentTeam?.opponentId ? currentLobbyState.teams.find((team) => team.id === currentTeam.opponentId) : null;
        if (!currentTeam?.setupConfirmed) {
          await confirmLobbyContinuation();
          return;
        }
        if (!opponentTeam?.setupConfirmed) {
          setLobbyStatus('1/2 users are ready. Waiting for the other team to press continue.');
          renderLobby();
          return;
        }
        openDiffTeamSetup();
      });
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

    const prevPageBtn = document.getElementById('lobby-page-prev-btn');
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', function() {
        if (lobbyWaitingTeamsPage > 1) {
          lobbyWaitingTeamsPage -= 1;
          renderLobby();
        }
      });
    }

    const nextPageBtn = document.getElementById('lobby-page-next-btn');
    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', function() {
        if (lobbyWaitingTeamsPage < totalWaitingPages) {
          lobbyWaitingTeamsPage += 1;
          renderLobby();
        }
      });
    }
  }

  function openLobbyPanel(statusMessage = 'Create a team to start the match lobby.') {
    gameState.playMode = 'diff';
    stopSessionSync();
    modeSelectDiv.style.display = 'none';
    teamForm.style.display = 'none';
    gameCanvas.style.display = 'none';
    if (lobbyPanel) lobbyPanel.style.display = '';
    hideFormError();
    hideGameResultOverlay();
    setLobbyBackendIndicator();
    setLobbyStatus(statusMessage);
    startLobbyExpiryWatcher();
    if (stopLobbySubscription) {
      stopLobbySubscription();
    }
    stopLobbySubscription = subscribeToLobby((lobbyState) => {
      const previousLobbyState = currentLobbyState;
      currentLobbyState = lobbyState;
      if (lobbyPanel && lobbyPanel.style.display !== 'none') {
        syncLobbyStatusFromState(previousLobbyState);
        renderLobby();
        if (isLobbyReadyForDiffSetup()) {
          openDiffTeamSetup();
        }
      }
    });
    getLobbySnapshot().then((lobbyState) => {
      currentLobbyState = lobbyState;
      return sweepExpiredLobbyMatches();
    }).then(() => {
      renderLobby();
    }).catch((error) => {
      setLobbyStatus(describeLobbyError(error, 'Could not read the Firebase lobby.'));
      console.error('Failed to fetch lobby snapshot:', error);
    });
    renderLobby();
  }

  if (sameDeviceBtn) {
    sameDeviceBtn.onclick = async function() {
      gameState.playMode = 'same';
      await leaveCurrentLobbyTeam();
      stopSessionSync();
      stopLobbyExpiryWatcher();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      modeSelectDiv.style.display = 'none';
      // Ensure player inputs and team name fields are created before showing the form
      createPlayerInputs(team1PlayersDiv, 'team1');
      createPlayerInputs(team2PlayersDiv, 'team2');
      configureSameDeviceTeamForm();
      hideFormError();
      showSameDeviceSetup();
      teamForm.style.display = '';
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
      stopLobbyExpiryWatcher();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      setLobbyStatus('');
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      showModeSelection();
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
        clearLiveMatchState();
        hideGameResultOverlay();
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
        const opponentTeamName = selectedTeam === 0 ? team2NameInput.value.trim() : team1NameInput.value.trim();
        const selectedPlayers = Array.from(selectedPlayersDiv.querySelectorAll('input'))
          .map((input, index) => input.value.trim() || `Player ${index + 1}`)
          .filter(Boolean);

        gameState.teamNames[selectedTeam] = selectedTeamName || currentTeam.name || `Team ${selectedTeam + 1}`;
        gameState.teamNames[1 - selectedTeam] = opponentTeamName || opponentTeam.name || `Team ${2 - selectedTeam}`;
        gameState.playerNames[selectedTeam] = [...selectedPlayers];

        currentSessionState = await saveSessionTeam(currentSessionId, selectedTeam, {
          teamId: currentTeam.id,
          ownerId: sessionOwnerId,
          slot: selectedTeam,
          name: selectedTeamName || `Team ${selectedTeam + 1}`,
          players: selectedPlayers,
          ready: true
        });
        await ensureSessionStarted(currentSessionId);
        await attachSession(currentSessionId);

        hideFormError();
        teamForm.style.display = 'none';
        if (gameCanvas) gameCanvas.style.display = 'none';
        const answerArea = document.getElementById('answer-area');
        if (answerArea) answerArea.style.display = 'none';
        setGameBoardVisible(true);
        drawGame(true);
        syncArenaDecorations();
        setLobbyStatus('Waiting for the shared match state...');
        return;
      }
      modeSelectDiv.style.display = 'none';
      stopLobbyExpiryWatcher();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      teamForm.style.display = 'none';
      gameCanvas.style.display = 'none';
      gameCanvas.width = 700;
      gameCanvas.height = 400;
      startGame();
      drawGame();
      syncArenaDecorations();
      if (newGameBtn) newGameBtn.style.display = 'none';
    };
  }

  window.addEventListener('keydown', function(e) {
    if (document.activeElement && document.activeElement.classList?.contains('calculator-display')) {
      return;
    }
    if (!gameState.gameActive) return;
    const inputTeam = gameState.playMode === 'diff' ? gameState.selectedTeam : gameState.currentTeam;
    if (e.key === 'Backspace') {
      updateCalculatorEntry(inputTeam, gameState.currentAnswer[inputTeam].slice(0, -1));
    } else if (e.key === 'Enter') {
      submitAnswer(inputTeam);
    } else if (/^[0-9\-]$/.test(e.key)) {
      updateCalculatorEntry(inputTeam, `${gameState.currentAnswer[inputTeam]}${e.key}`);
    }
    drawGame();
    syncArenaDecorations();
  });

  // Show new game button at game over
  const originalDrawGame = drawGame;
  function drawGameWithNewGameBtn(gameOver = false) {
    originalDrawGame(gameOver);
    syncArenaDecorations();
    // Show/hide answer area based on game state
    const answerArea = document.getElementById('answer-area');
    if (answerArea) answerArea.style.display = (gameOver || !gameState.gameActive) ? 'none' : '';
    if (newGameBtn) {
      if ((gameOver || !gameState.gameActive) && gameState.playMode !== 'diff') {
        newGameBtn.style.display = 'inline-block';
      } else {
        newGameBtn.style.display = 'none';
      }
    }
    showGameResultOverlay();
  }
  // Override drawGame globally
  window.drawGame = drawGameWithNewGameBtn;

  if (gameResultLobbyBtn) {
    gameResultLobbyBtn.addEventListener('click', async function() {
      await waitInLobbyAfterGame();
      updateHeroSection();
    });
  }

  if (gameResultRestartBtn) {
    gameResultRestartBtn.addEventListener('click', async function() {
      dismissGameResultOverlay();
      resetGameState();
      resetDisplayedAnswers();
      if (modeSelectDiv) modeSelectDiv.style.display = '';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (gameCanvas) gameCanvas.style.display = 'none';
      if (newGameBtn) newGameBtn.style.display = 'none';
      setGameBoardVisible(false);
      showLevelSelection();
      updateHeroSection();
    });
  }

  if (gameResultHomeBtn) {
    gameResultHomeBtn.addEventListener('click', async function() {
      dismissGameResultOverlay();
      resetGameState();
      resetDisplayedAnswers();
      if (modeSelectDiv) modeSelectDiv.style.display = '';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (gameCanvas) gameCanvas.style.display = 'none';
      if (newGameBtn) newGameBtn.style.display = 'none';
      setGameBoardVisible(false);
      showWelcomeScreen();
      updateHeroSection();
    });
  }

  if (gameResultLeaveBtn) {
    gameResultLeaveBtn.addEventListener('click', async function() {
      dismissGameResultOverlay();
      await leaveCurrentLobbyTeam();
      stopSessionSync();
      stopLobbyExpiryWatcher();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      resetGameState();
      resetDisplayedAnswers();
      if (modeSelectDiv) modeSelectDiv.style.display = '';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (gameCanvas) gameCanvas.style.display = 'none';
      if (newGameBtn) newGameBtn.style.display = 'none';
      setGameBoardVisible(false);
      showModeSelection();
      updateHeroSection();
    });
  }

  if (gameResultExitBtn) {
    gameResultExitBtn.addEventListener('click', async function() {
      dismissGameResultOverlay();
      await leaveCurrentLobbyTeam();
      stopSessionSync();
      stopLobbyExpiryWatcher();
      if (stopLobbySubscription) {
        stopLobbySubscription();
        stopLobbySubscription = null;
      }
      resetGameState();
      resetDisplayedAnswers();
      if (modeSelectDiv) modeSelectDiv.style.display = '';
      if (lobbyPanel) lobbyPanel.style.display = 'none';
      if (teamForm) teamForm.style.display = 'none';
      if (gameCanvas) gameCanvas.style.display = 'none';
      if (newGameBtn) newGameBtn.style.display = 'none';
      setGameBoardVisible(false);
      showWelcomeScreen();
      updateHeroSection();
    });
  }

  if (newGameBtn) {
    newGameBtn.addEventListener('click', async function() {
      await leaveCurrentLobbyTeam();
      stopSessionSync();
      stopLobbyExpiryWatcher();
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
      resetDisplayedAnswers();
      setGameBoardVisible(false);
      showWelcomeScreen();
      hideGameResultOverlay();
    });
  }
});
