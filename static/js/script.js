// Track last question and wrong answer state
let lastQuestion = null;
let wrongStreak = 0;
import { getTeam1PlayersDiv, getTeam2PlayersDiv, getTeamForm, getGameCanvas, getModeSelectDiv, showFormError, hideFormError } from './modules/dom.js';
import { gameState, POINTS_TO_WIN } from './modules/gameState.js';
import { createPlayerInputs, setRopePosition } from './modules/ui.js';
import { handleAnswer, endGame, nextQuestion, drawGame } from './modules/gameLogic.js';
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
      // Switch to next team and always give new question
      gameState.currentTeam = 1 - gameState.currentTeam;
      if (gameState.teamTimeLeft[gameState.currentTeam] > 0) {
        nextQuestion(gameState.currentTeam);
      }
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
    function submitAnswer() {
      if (!gameState.gameActive) return;
      if (!answerInput) return;
      const ans = answerInput.value.trim();
      if (ans === '') return;
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
      sidebarNewGameBtn.addEventListener('click', function(e) {
        e.preventDefault();
        resetGameState();
        // Reset UI
        const modeSelectDiv = getModeSelectDiv();
        const teamForm = getTeamForm();
        const gameCanvas = getGameCanvas();
        const newGameBtn = document.getElementById('new-game-btn');
        if (modeSelectDiv) modeSelectDiv.style.display = '';
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

  if (sameDeviceBtn) {
    sameDeviceBtn.onclick = function() {
      gameState.playMode = 'same';
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
      gameState.playMode = 'diff';
      modeSelectDiv.style.display = 'none';
      let joinDiv = document.getElementById('join-code-div');
      if (!joinDiv) {
        joinDiv = document.createElement('div');
        joinDiv.id = 'join-code-div';
        joinDiv.style.margin = '2rem auto';
        joinDiv.style.textAlign = 'center';
        joinDiv.style.fontSize = '1.3rem';
        joinDiv.style.background = '#f5f5f5';
        joinDiv.style.padding = '2rem';
        joinDiv.style.borderRadius = '12px';
        joinDiv.style.width = 'fit-content';
        joinDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        document.body.appendChild(joinDiv);
      }
      // Generate a simple join code
      gameState.joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      joinDiv.style.display = 'block';
      teamForm.style.display = 'none';
      gameCanvas.style.display = 'none';
      joinDiv.innerHTML = `<b>Share this code with your teammate:</b><br><span style='font-size:2rem;color:#1976d2;'>${gameState.joinCode}</span><br><br><input id='join-team-input' placeholder='Enter team (1 or 2)' style='font-size:1.1rem;padding:0.3rem 0.7rem;width:120px;text-align:center;'/><br><button id='join-team-btn' style='margin-top:1rem;font-size:1.1rem;padding:0.5rem 1.2rem;background:#1976d2;color:#fff;border:none;border-radius:6px;cursor:pointer;'>Join Game</button><div id='join-waiting-msg' style='margin-top:1.2rem;color:#888;'></div>`;
      const joinBtn = document.getElementById('join-team-btn');
      if (joinBtn) {
        joinBtn.addEventListener('click', function() {
          const teamVal = document.getElementById('join-team-input').value.trim();
          if (teamVal !== '1' && teamVal !== '2') {
            alert('Enter 1 or 2 for team.');
            return;
          }
          gameState.selectedTeam = parseInt(teamVal) - 1;
          joinDiv.style.display = 'none';
          if (teamForm) {
            teamForm.style.display = 'block';
            teamForm.style.visibility = 'visible';
            teamForm.style.opacity = '1';
            teamForm.removeAttribute('hidden');
          }
          const team1Card = document.querySelectorAll('.skribbl-form-team-card')[0];
          const team2Card = document.querySelectorAll('.skribbl-form-team-card')[1];
          if (gameState.selectedTeam === 0) {
            team1PlayersDiv.style.display = '';
            team2PlayersDiv.style.display = 'none';
            if (team1Card) team1Card.style.display = '';
            if (team2Card) team2Card.style.display = 'none';
            createPlayerInputs(team1PlayersDiv, 'team1');
            document.getElementById('team1-name').required = true;
            document.getElementById('team1-name').disabled = false;
            document.getElementById('team2-name').required = false;
            document.getElementById('team2-name').disabled = true;
            setTimeout(() => {
              Array.from(team1PlayersDiv.querySelectorAll('input')).forEach(i => { i.required = true; i.disabled = false; });
              Array.from(team2PlayersDiv.querySelectorAll('input')).forEach(i => { i.required = false; i.disabled = true; });
            }, 0);
          } else {
            team1PlayersDiv.style.display = 'none';
            team2PlayersDiv.style.display = '';
            if (team1Card) team1Card.style.display = 'none';
            if (team2Card) team2Card.style.display = '';
            createPlayerInputs(team2PlayersDiv, 'team2');
            document.getElementById('team2-name').required = true;
            document.getElementById('team2-name').disabled = false;
            document.getElementById('team1-name').required = false;
            document.getElementById('team1-name').disabled = true;
            setTimeout(() => {
              Array.from(team2PlayersDiv.querySelectorAll('input')).forEach(i => { i.required = true; i.disabled = false; });
              Array.from(team1PlayersDiv.querySelectorAll('input')).forEach(i => { i.required = false; i.disabled = true; });
            }, 0);
          }
          teamForm.style.removeProperty('display');
          if (team1Card) team1Card.style.removeProperty('display');
          if (team2Card) team2Card.style.removeProperty('display');
        });
      }
    };
  }

  if (teamForm) {
    teamForm.onsubmit = function(e) {
      e.preventDefault();
      // Extra safety: check team name fields exist before starting game
      const team1NameInput = document.getElementById('team1-name');
      const team2NameInput = document.getElementById('team2-name');
      if (!team1NameInput || !team2NameInput) {
        showFormError('Team name fields are missing. Please reload the page.');
        return;
      }
      modeSelectDiv.style.display = 'none';
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
    newGameBtn.addEventListener('click', function() {
      resetGameState();
      // Reset UI
      if (modeSelectDiv) modeSelectDiv.style.display = '';
      if (teamForm) teamForm.style.display = 'none';
      if (gameCanvas) gameCanvas.style.display = 'none';
      newGameBtn.style.display = 'none';
    });
  }
});
