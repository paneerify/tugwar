// Game state and constants

export const POINTS_TO_WIN = 60;
export const gameState = {
    teamNames: ["Team 1", "Team 2"],
    playerNames: [[], []],
    teamScores: [0, 0],
    teamDifficulty: [0, 0],
    currentTeam: 0,
    currentPlayer: [0, 0],
    currentQuestion: [null, null],
    currentAnswer: ['', ''],
    questionTimer: null,
    questionTimeLeft: [0, 0],
    gameTimer: null,
    teamTimeLeft: [150, 150],
    joinCode: null,
    joinedTeams: 0,
    gameActive: false,
    tiebreakerActive: false,
    tiebreakerAnswered: [false, false],
    questionAttemptedBy: [false, false],
    revealedAnswer: null,
    revealAnswerTimeLeft: 0,
    pendingNextTeam: null,
    selectedLevel: 0,
    playMode: null,
    selectedTeam: null,
    matchStarted: false,
    winner: null,
    gameOver: false
};

export function resetGameState() {
    gameState.teamNames = ["Team 1", "Team 2"];
    gameState.playerNames = [[], []];
    gameState.teamScores = [0, 0];
    gameState.teamDifficulty = [0, 0];
    gameState.currentTeam = 0;
    gameState.currentPlayer = [0, 0];
    gameState.currentQuestion = [null, null];
    gameState.currentAnswer = ['', ''];
    gameState.questionTimer = null;
    gameState.questionTimeLeft = [0, 0];
    gameState.gameTimer = null;
    gameState.teamTimeLeft = [150, 150];
    gameState.joinCode = null;
    gameState.joinedTeams = 0;
    gameState.gameActive = false;
    gameState.tiebreakerActive = false;
    gameState.tiebreakerAnswered = [false, false];
    gameState.questionAttemptedBy = [false, false];
    gameState.revealedAnswer = null;
    gameState.revealAnswerTimeLeft = 0;
    gameState.pendingNextTeam = null;
    gameState.selectedLevel = 0;
    gameState.playMode = null;
    gameState.selectedTeam = null;
    gameState.matchStarted = false;
    gameState.winner = null;
    gameState.gameOver = false;
}
