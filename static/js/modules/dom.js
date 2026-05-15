// DOM references and UI helpers

export function getTeam1PlayersDiv() {
    return document.getElementById('team1-players');
}
export function getTeam2PlayersDiv() {
    return document.getElementById('team2-players');
}
export function getTeamForm() {
    return document.getElementById('team-form');
}
export function getGameCanvas() {
    return document.getElementById('game-canvas');
}
export function getModeSelectDiv() {
    return document.getElementById('mode-select');
}
export function getFormError() {
    return document.getElementById('form-error');
}

export function showFormError(msg) {
    const formError = getFormError();
    formError.textContent = msg;
    formError.style.display = 'block';
}

export function hideFormError() {
    const formError = getFormError();
    formError.textContent = '';
    formError.style.display = 'none';
}
