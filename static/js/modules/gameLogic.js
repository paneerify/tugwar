// Core game logic functions
import { gameState, POINTS_TO_WIN } from './gameState.js';
import { DIFFICULTY, genAdvanced } from './difficulty.js';
import { getGameCanvas } from './dom.js';

function cloneGameSnapshot(snapshot) {
    return {
        ...snapshot,
        teamNames: [...snapshot.teamNames],
        playerNames: snapshot.playerNames.map((team) => [...team]),
        teamScores: [...snapshot.teamScores],
        teamDifficulty: [...snapshot.teamDifficulty],
        currentPlayer: [...snapshot.currentPlayer],
        currentQuestion: snapshot.currentQuestion.map((question) => (question ? { ...question } : null)),
        currentAnswer: [...snapshot.currentAnswer],
        questionTimeLeft: [...snapshot.questionTimeLeft],
        teamTimeLeft: [...snapshot.teamTimeLeft],
        tiebreakerAnswered: [...snapshot.tiebreakerAnswered],
        questionAttemptedBy: [...(snapshot.questionAttemptedBy || [false, false])],
        revealedAnswer: snapshot.revealedAnswer ? { ...snapshot.revealedAnswer } : null,
        revealAnswerTimeLeft: snapshot.revealAnswerTimeLeft || 0,
        pendingNextTeam: snapshot.pendingNextTeam ?? null
    };
}

function generateQuestionForTeam(teamIdx, snapshot) {
    const difficultyIndex = snapshot.teamDifficulty[teamIdx];
    return {
        question: DIFFICULTY[difficultyIndex].gen(),
        time: DIFFICULTY[difficultyIndex].time
    };
}

function finishGame(snapshot, winner = null) {
    snapshot.gameActive = false;
    snapshot.winner = winner;
    snapshot.gameOver = true;
    return snapshot;
}

function startFreshQuestion(snapshot, teamIdx) {
    const questionData = generateQuestionForTeam(teamIdx, snapshot);
    snapshot.currentTeam = teamIdx;
    snapshot.currentQuestion = [null, null];
    snapshot.currentQuestion[teamIdx] = questionData.question;
    snapshot.currentAnswer = ['', ''];
    snapshot.questionTimeLeft = [0, 0];
    snapshot.questionTimeLeft[teamIdx] = questionData.time;
    snapshot.questionAttemptedBy = [false, false];
    snapshot.revealedAnswer = null;
    snapshot.revealAnswerTimeLeft = 0;
    snapshot.pendingNextTeam = null;
    return snapshot;
}

function queueAnswerReveal(snapshot, question, nextTeam) {
    snapshot.currentQuestion = [null, null];
    snapshot.questionTimeLeft = [0, 0];
    snapshot.revealedAnswer = question ? { question: question.q, answer: question.ans } : null;
    snapshot.revealAnswerTimeLeft = 2;
    snapshot.pendingNextTeam = nextTeam;
    return snapshot;
}

export function buildInitialGameSnapshot(teamNames, playerNames) {
    const snapshot = {
        teamNames: [...teamNames],
        playerNames: playerNames.map((team) => [...team]),
        teamScores: [0, 0],
        teamDifficulty: [0, 0],
        currentTeam: 0,
        currentPlayer: [0, 0],
        currentQuestion: [null, null],
        currentAnswer: ['', ''],
        questionTimeLeft: [0, 0],
        teamTimeLeft: [150, 150],
        gameActive: true,
        tiebreakerActive: false,
        tiebreakerAnswered: [false, false],
        questionAttemptedBy: [false, false],
        revealedAnswer: null,
        revealAnswerTimeLeft: 0,
        pendingNextTeam: null,
        winner: null,
        gameOver: false
    };
    return startFreshQuestion(snapshot, 0);
}

export function applyGameSnapshot(snapshot) {
    gameState.teamNames = [...snapshot.teamNames];
    gameState.playerNames = snapshot.playerNames.map((team) => [...team]);
    gameState.teamScores = [...snapshot.teamScores];
    gameState.teamDifficulty = [...snapshot.teamDifficulty];
    gameState.currentTeam = snapshot.currentTeam;
    gameState.currentPlayer = [...snapshot.currentPlayer];
    gameState.currentQuestion = snapshot.currentQuestion.map((question) => (question ? { ...question } : null));
    gameState.currentAnswer = [...snapshot.currentAnswer];
    gameState.questionTimeLeft = [...snapshot.questionTimeLeft];
    gameState.teamTimeLeft = [...snapshot.teamTimeLeft];
    gameState.gameActive = snapshot.gameActive;
    gameState.tiebreakerActive = snapshot.tiebreakerActive;
    gameState.tiebreakerAnswered = [...snapshot.tiebreakerAnswered];
    gameState.questionAttemptedBy = [...(snapshot.questionAttemptedBy || [false, false])];
    gameState.revealedAnswer = snapshot.revealedAnswer ? { ...snapshot.revealedAnswer } : null;
    gameState.revealAnswerTimeLeft = snapshot.revealAnswerTimeLeft || 0;
    gameState.pendingNextTeam = snapshot.pendingNextTeam ?? null;
}

export function resolveSubmittedAnswer(snapshot, ans, answeringTeam = snapshot.currentTeam) {
    const nextState = cloneGameSnapshot(snapshot);
    if (!nextState.gameActive || nextState.revealAnswerTimeLeft > 0) {
        return nextState;
    }

    const teamIdx = answeringTeam;

    if (nextState.tiebreakerActive) {
        const isCorrect = ans !== null && String(ans).trim() === String(nextState.currentQuestion[teamIdx]?.ans);
        nextState.tiebreakerAnswered[teamIdx] = true;
        if (isCorrect) {
            nextState.teamScores[teamIdx] += 5;
            return finishGame(nextState, teamIdx);
        }
        if (nextState.tiebreakerAnswered[0] && nextState.tiebreakerAnswered[1]) {
            return queueAnswerReveal(nextState, nextState.currentQuestion[teamIdx], 0);
        }
        return nextState;
    }

    const isCorrect = ans !== null && String(ans).trim() === String(nextState.currentQuestion[teamIdx]?.ans);
    nextState.currentAnswer[teamIdx] = ans === null ? '' : String(ans);
    nextState.currentPlayer[teamIdx] = (nextState.currentPlayer[teamIdx] + 1) % Math.max(1, nextState.playerNames[teamIdx].length);
    nextState.questionAttemptedBy[teamIdx] = true;

    if (isCorrect) {
        nextState.teamScores[teamIdx] += 5;
        if (nextState.teamDifficulty[teamIdx] < 2) {
            nextState.teamDifficulty[teamIdx] += 1;
        }
        if (nextState.teamScores[teamIdx] >= POINTS_TO_WIN) {
            nextState.teamTimeLeft[teamIdx] = 0;
            return finishGame(nextState, teamIdx);
        }

        const nextTeam = 1 - teamIdx;
        return startFreshQuestion(nextState, nextTeam);
    } else {
        nextState.teamScores[teamIdx] = Math.max(0, nextState.teamScores[teamIdx] - 5);
        const nextTeam = 1 - teamIdx;
        if (nextState.questionAttemptedBy[nextTeam]) {
            return queueAnswerReveal(nextState, nextState.currentQuestion[teamIdx], nextTeam);
        }
        nextState.currentTeam = nextTeam;
        nextState.currentQuestion[nextTeam] = nextState.currentQuestion[teamIdx] ? { ...nextState.currentQuestion[teamIdx] } : null;
        nextState.currentQuestion[teamIdx] = null;
        nextState.questionTimeLeft[teamIdx] = 0;
        nextState.questionTimeLeft[nextTeam] = DIFFICULTY[nextState.teamDifficulty[nextTeam]].time;
    }

    if (nextState.teamTimeLeft[0] === 0 && nextState.teamTimeLeft[1] === 0) {
        return resolveGameEnd(nextState);
    }

    return nextState;
}

export function resolveGameEnd(snapshot) {
    const nextState = cloneGameSnapshot(snapshot);
    if (nextState.teamScores[0] === nextState.teamScores[1]) {
        nextState.tiebreakerActive = true;
        nextState.tiebreakerAnswered = [false, false];
        nextState.currentQuestion[0] = genAdvanced();
        nextState.currentQuestion[1] = { ...nextState.currentQuestion[0] };
        nextState.currentAnswer = ['', ''];
        nextState.questionTimeLeft = [50, 50];
        nextState.questionAttemptedBy = [false, false];
        nextState.revealedAnswer = null;
        nextState.revealAnswerTimeLeft = 0;
        nextState.pendingNextTeam = null;
        nextState.currentTeam = 0;
        return nextState;
    }
    const winner = nextState.teamScores[0] > nextState.teamScores[1] ? 0 : 1;
    return finishGame(nextState, winner);
}

export function tickGameSnapshot(snapshot) {
    const nextState = cloneGameSnapshot(snapshot);
    if (!nextState.gameActive) {
        return nextState;
    }

    if (nextState.revealAnswerTimeLeft > 0) {
        nextState.revealAnswerTimeLeft = Math.max(0, nextState.revealAnswerTimeLeft - 1);
        if (nextState.revealAnswerTimeLeft === 0) {
            if (nextState.tiebreakerActive) {
                return finishGame(nextState, null);
            }
            return startFreshQuestion(nextState, nextState.pendingNextTeam ?? 0);
        }
        return nextState;
    }

    if (nextState.tiebreakerActive) {
        nextState.questionTimeLeft[0] = Math.max(0, nextState.questionTimeLeft[0] - 1);
        nextState.questionTimeLeft[1] = Math.max(0, nextState.questionTimeLeft[1] - 1);
        if (nextState.questionTimeLeft[0] === 0 && nextState.questionTimeLeft[1] === 0) {
            return queueAnswerReveal(nextState, nextState.currentQuestion[0], 0);
        }
        return nextState;
    }

    for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
        if (nextState.teamTimeLeft[teamIdx] > 0) {
            nextState.teamTimeLeft[teamIdx] -= 1;
        }
    }

    const currentTeam = nextState.currentTeam;
    if (nextState.questionTimeLeft[currentTeam] > 0) {
        nextState.questionTimeLeft[currentTeam] -= 1;
    }

    if (nextState.teamTimeLeft[0] === 0 && nextState.teamTimeLeft[1] === 0) {
        return resolveGameEnd(nextState);
    }

    if (nextState.questionTimeLeft[currentTeam] === 0) {
        return resolveSubmittedAnswer(nextState, null, currentTeam);
    }

    return nextState;
}

export function handleAnswer(ans, answeringTeam = gameState.currentTeam) {
    if (gameState.questionTimer) clearInterval(gameState.questionTimer);
    const nextState = resolveSubmittedAnswer(gameState, ans, answeringTeam);
    applyGameSnapshot(nextState);
    syncLocalQuestionTimers();
    if (!gameState.gameActive) {
        endGame();
        return;
    }
    drawGame();
}
// ...existing code for handleAnswer ends here (no extra closing brace needed)
// (removed stray brace)

export function endGame() {
    clearInterval(gameState.gameTimer);
    clearInterval(gameState.questionTimer);
    clearLocalQuestionTimers();
    drawGame(true);
}

let teamTimers = [null, null];
function clearLocalQuestionTimers() {
    for (let teamIdx = 0; teamIdx < teamTimers.length; teamIdx++) {
        if (teamTimers[teamIdx]) {
            clearInterval(teamTimers[teamIdx]);
            teamTimers[teamIdx] = null;
        }
    }
}

function syncLocalQuestionTimers() {
    clearLocalQuestionTimers();
    if (gameState.playMode === 'same') {
        return;
    }
    if (!gameState.gameActive || gameState.tiebreakerActive) {
        return;
    }
    const currentTeam = gameState.currentTeam;
    if (gameState.questionTimeLeft[currentTeam] <= 0) {
        return;
    }
    teamTimers[currentTeam] = setInterval(() => {
        gameState.questionTimeLeft[currentTeam]--;
        if (gameState.questionTimeLeft[currentTeam] <= 0) {
            clearLocalQuestionTimers();
            handleAnswer(null);
        }
        drawGame();
    }, 1000);
}

export function nextQuestion(teamIdx) {
    const nextState = cloneGameSnapshot(gameState);
    startFreshQuestion(nextState, teamIdx);
    applyGameSnapshot(nextState);
    syncLocalQuestionTimers();
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
