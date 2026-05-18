// Animate the rope position based on a value between -1 (left) and 1 (right)
let lastRopePos = 0;
export function setRopePosition(position) {
    // Clamp position between -1 and 1
    position = Math.max(-1, Math.min(1, position));
    const ropeGroup = document.getElementById('rope-group');
    if (ropeGroup) {
        const maxTranslate = ropeGroup instanceof SVGElement ? 250 : 130;
        if (ropeGroup instanceof SVGElement) {
            ropeGroup.setAttribute('transform', `translate(${300 + position * maxTranslate},0)`);
        } else {
            ropeGroup.style.transform = `translate(calc(-50% + ${position * maxTranslate}px), -50%)`;
        }
    }
    // Play SFX if rope moves significantly
    if (Math.abs(position - lastRopePos) > 0.01) {
        const ropeAudio = document.getElementById('rope-move-audio');
        if (ropeAudio) {
            try {
                ropeAudio.currentTime = 0;
                ropeAudio.play();
            } catch (e) {}
        }
    }
    lastRopePos = position;
}
// UI and event handler helpers
import { showFormError, hideFormError } from './dom.js';
import { gameState } from './gameState.js'; // Importing gameState object

export function createPlayerInputs(teamDiv, teamId) {
    teamDiv.innerHTML = '';
    for (let i = 1; i <= 2; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `${teamId}-player${i}`;
        input.placeholder = `Player ${i} Name`;
        input.maxLength = 14;
        input.required = true;
        input.style.margin = '0.2rem 0';
        input.style.display = 'block';
        teamDiv.appendChild(input);
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+ Add Player';
    addBtn.className = 'skribbl-form-add-btn';
    addBtn.style.margin = '0.3rem 0.5rem 0 0';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '- Remove Player';
    removeBtn.className = 'skribbl-form-remove-btn';
    removeBtn.style.margin = '0.3rem 0';
    teamDiv.appendChild(addBtn);
    teamDiv.appendChild(removeBtn);
    addBtn.onclick = () => {
        const current = teamDiv.querySelectorAll('input').length;
        if (current >= 5) {
            showFormError('Maximum 5 players per team.');
            return;
        }
        hideFormError();
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `${teamId}-player${current + 1}`;
        input.placeholder = `Player ${current + 1} Name`;
        input.maxLength = 14;
        input.required = true;
        input.style.margin = '0.2rem 0';
        input.style.display = 'block';
        teamDiv.insertBefore(input, addBtn);
    };
    removeBtn.onclick = () => {
        const inputs = teamDiv.querySelectorAll('input');
        if (inputs.length <= 2) {
            showFormError('Minimum 2 players per team.');
            return;
        }
        hideFormError();
        teamDiv.removeChild(inputs[inputs.length - 1]);
    };
}
