// Animate the rope position based on a value between -1 (left) and 1 (right)
let lastRopePos = 0;
let currentRopePos = 0;
let targetRopePos = 0;
let ropeAnimationFrame = null;
let ropeMotionTimeout = null;

function applyRopePosition(ropeGroup, position) {
    const maxTranslate = ropeGroup instanceof SVGElement ? 250 : 130;
    if (ropeGroup instanceof SVGElement) {
        ropeGroup.setAttribute('transform', `translate(${300 + position * maxTranslate},0)`);
        return;
    }

    ropeGroup.style.setProperty('--rope-offset', `${position * maxTranslate}px`);
    const bobAmount = Math.min(1, Math.abs(targetRopePos - position) * 18);
    ropeGroup.style.setProperty('--rope-bob', `${bobAmount.toFixed(2)}px`);
}

function finishRopeMotion(ropeGroup) {
    ropeGroup.classList.remove('is-moving', 'is-pulling-left', 'is-pulling-right');
    ropeGroup.style.setProperty('--rope-bob', '0px');
    if (ropeMotionTimeout) {
        clearTimeout(ropeMotionTimeout);
        ropeMotionTimeout = null;
    }
}

function animateRope(ropeGroup) {
    currentRopePos += (targetRopePos - currentRopePos) * 0.16;
    if (Math.abs(targetRopePos - currentRopePos) < 0.0025) {
        currentRopePos = targetRopePos;
    }

    applyRopePosition(ropeGroup, currentRopePos);

    if (currentRopePos !== targetRopePos) {
        ropeAnimationFrame = window.requestAnimationFrame(() => animateRope(ropeGroup));
        return;
    }

    ropeAnimationFrame = null;
    ropeMotionTimeout = window.setTimeout(() => finishRopeMotion(ropeGroup), 180);
}

export function setRopePosition(position) {
    // Clamp position between -1 and 1
    position = Math.max(-1, Math.min(1, position));
    const ropeGroup = document.getElementById('rope-group');
    if (ropeGroup) {
        targetRopePos = position;
        const delta = targetRopePos - currentRopePos;
        if (Math.abs(delta) > 0.001) {
            ropeGroup.classList.add('is-moving');
            ropeGroup.classList.toggle('is-pulling-left', delta < 0);
            ropeGroup.classList.toggle('is-pulling-right', delta > 0);
            if (ropeMotionTimeout) {
                clearTimeout(ropeMotionTimeout);
                ropeMotionTimeout = null;
            }
        }

        if (ropeAnimationFrame) {
            window.cancelAnimationFrame(ropeAnimationFrame);
            ropeAnimationFrame = null;
        }

        if (ropeGroup instanceof SVGElement) {
            applyRopePosition(ropeGroup, targetRopePos);
            finishRopeMotion(ropeGroup);
        } else {
            animateRope(ropeGroup);
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
