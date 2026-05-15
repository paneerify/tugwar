// Core game logic functions
import { gameState, POINTS_TO_WIN } from './gameState.js';
import { DIFFICULTY, genAdvanced } from './difficulty.js';
import { getGameCanvas } from './dom.js';

export function handleAnswer(ans) {
    if (gameState.questionTimer) clearInterval(gameState.questionTimer);
    let teamIdx = gameState.currentTeam;
    let correct = (ans !== null && String(ans).trim() === String(gameState.currentQuestion[teamIdx]?.ans));
    if (correct) {
        gameState.teamScores[teamIdx] += 5;
        if (gameState.teamDifficulty[teamIdx] < 2) gameState.teamDifficulty[teamIdx]++;
        if (gameState.teamScores[teamIdx] >= POINTS_TO_WIN) {
            gameState.teamTimeLeft[teamIdx] = 0;
            endGame();
            return;
        }
        gameState.currentPlayer[teamIdx] = (gameState.currentPlayer[teamIdx] + 1) % gameState.playerNames[teamIdx].length;
        // New question for next team
        gameState.currentTeam = 1 - teamIdx;
        if (gameState.teamTimeLeft[gameState.currentTeam] > 0) {
            nextQuestion(gameState.currentTeam);
        } else {
            gameState.currentTeam = teamIdx; // revert if other team is out of time
            if (gameState.teamTimeLeft[gameState.currentTeam] > 0) {
                nextQuestion(gameState.currentTeam);
            } else {
                endGame();
            }
        }
    } else {
        // Wrong answer: switch to other team, same question, reset timer
        gameState.teamScores[teamIdx] -= 5;
        if (gameState.teamScores[teamIdx] < 0) gameState.teamScores[teamIdx] = 0;
        gameState.currentPlayer[teamIdx] = (gameState.currentPlayer[teamIdx] + 1) % gameState.playerNames[teamIdx].length;
        gameState.currentTeam = 1 - teamIdx;
        // Only reset timer for the new team, keep the same question
        let diff = gameState.teamDifficulty[gameState.currentTeam];
        let q = gameState.currentQuestion[teamIdx];
        gameState.currentQuestion[gameState.currentTeam] = q; // share question
        gameState.questionTimeLeft[gameState.currentTeam] = DIFFICULTY[diff].time;
        if (teamTimers[gameState.currentTeam]) clearInterval(teamTimers[gameState.currentTeam]);
        teamTimers[gameState.currentTeam] = setInterval(() => {
            gameState.questionTimeLeft[gameState.currentTeam]--;
            if (gameState.questionTimeLeft[gameState.currentTeam] <= 0) {
                clearInterval(teamTimers[gameState.currentTeam]);
                handleAnswer(null);
            }
            drawGame();
        }, 1000);
        drawGame();
    }
    // If both teams are out of time, end game and stop all question timers
    if (gameState.teamTimeLeft[0] === 0 && gameState.teamTimeLeft[1] === 0) {
        if (gameState.questionTimer) clearInterval(gameState.questionTimer);
        if (typeof teamTimers !== 'undefined') {
            for (let t = 0; t < teamTimers.length; t++) {
                if (teamTimers[t]) clearInterval(teamTimers[t]);
            }
        }
        endGame();
        return;
    }
}
// ...existing code for handleAnswer ends here (no extra closing brace needed)
// (removed stray brace)

export function endGame() {
    const gameTimeLeft = Math.max(gameState.teamTimeLeft[0], gameState.teamTimeLeft[1]);
    if (gameTimeLeft <= 0 && gameState.teamScores[0] !== gameState.teamScores[1]) {
        gameState.gameActive = false;
        clearInterval(gameState.gameTimer);
        clearInterval(gameState.questionTimer);
        drawGame(true);
        return;
    }
    if (gameState.teamScores[0] === gameState.teamScores[1]) {
        gameState.tiebreakerActive = true;
        gameState.tiebreakerAnswered[0] = false;
        gameState.tiebreakerAnswered[1] = false;
        gameState.currentQuestion[0] = genAdvanced();
        gameState.currentQuestion[1] = gameState.currentQuestion[0];
        gameState.currentAnswer[0] = '';
        gameState.currentAnswer[1] = '';
        gameState.questionTimeLeft[0] = 50;
        gameState.questionTimeLeft[1] = 50;
        clearInterval(gameState.gameTimer);
        clearInterval(gameState.questionTimer);
        gameState.questionTimer = setInterval(() => {
            gameState.questionTimeLeft[0]--;
            gameState.questionTimeLeft[1]--;
            if (gameState.questionTimeLeft[0] <= 0 && gameState.questionTimeLeft[1] <= 0) {
                gameState.questionTimeLeft[0] = 0;
                gameState.questionTimeLeft[1] = 0;
                drawGame(true);
            }
            drawGame(true);
        }, 1000);
        drawGame(true);
        return;
    }
    gameState.gameActive = false;
    clearInterval(gameState.gameTimer);
    clearInterval(gameState.questionTimer);
    drawGame(true);
}

let teamTimers = [null, null];
export function nextQuestion(teamIdx) {
    gameState.currentAnswer[teamIdx] = '';
    let diff = gameState.teamDifficulty[teamIdx];
    gameState.currentQuestion[teamIdx] = DIFFICULTY[diff].gen();
    gameState.questionTimeLeft[teamIdx] = DIFFICULTY[diff].time;
    if (teamTimers[teamIdx]) clearInterval(teamTimers[teamIdx]);
    teamTimers[teamIdx] = setInterval(() => {
        gameState.questionTimeLeft[teamIdx]--;
        if (gameState.questionTimeLeft[teamIdx] <= 0) {
            clearInterval(teamTimers[teamIdx]);
            handleAnswer(null);
        }
        drawGame();
    }, 1000);
    drawGame();
}

// Draw game function must be exported at top level
export function drawGame(gameOver = false) {
    const gameCanvas = getGameCanvas();
    if (!gameCanvas) return;
    const ctx = gameCanvas.getContext('2d');
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    ctx.save();
    let showTeam = gameState.currentTeam;
    // Only show math question and timer
    ctx.font = 'bold 48px "Roboto Mono", monospace';
    ctx.fillStyle = '#1976d2';
    ctx.textAlign = 'center';
    ctx.fillText(gameState.currentQuestion[showTeam]?.q || '', gameCanvas.width/2, gameCanvas.height/2 - 20);
    ctx.font = 'bold 36px "Roboto Mono", monospace';
    ctx.fillStyle = '#d32f2f';
    ctx.fillText(`Time Left: ${gameState.questionTimeLeft[showTeam]}s`, gameCanvas.width/2, gameCanvas.height/2 + 50);
    ctx.restore();

    ctx.restore();
}

function formatTime(sec) {
    let m = Math.floor(sec/60);
    let s = sec%60;
    return `${m}:${s.toString().padStart(2,'0')}`;
}
