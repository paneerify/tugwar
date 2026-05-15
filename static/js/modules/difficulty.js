// Difficulty settings and question generators
export function genBasic() {
    let a = randInt(1, 20), b = randInt(1, 20);
    let op = Math.random() < 0.5 ? '+' : '-';
    let q = `${a} ${op} ${b} = ?`;
    let ans = op === '+' ? a + b : a - b;
    return { q, ans };
}

export function genMedium() {
    let op = Math.random() < 0.5 ? '×' : '÷';
    let a, b, q, ans;
    if (op === '×') {
        a = randInt(2, 20); b = randInt(2, 12);
        q = `${a} × ${b} = ?`;
        ans = a * b;
    } else {
        b = randInt(2, 12); ans = randInt(2, 12); a = b * ans;
        q = `${a} ÷ ${b} = ?`;
    }
    return { q, ans };
}

export function genAdvanced() {
    let type = randInt(1, 3);
    let q, ans;
    if (type === 1) {
        let a = randInt(2, 9), b = randInt(2, 4);
        q = `${a} ^ ${b} = ?`;
        ans = Math.pow(a, b);
    } else if (type === 2) {
        let a = randInt(-20, 20), b = randInt(-20, 20), c = randInt(1, 10);
        q = `(${a} + ${b}) × ${c} = ?`;
        ans = (a + b) * c;
    } else {
        let a = randInt(10, 99), b = randInt(1, 9), c = randInt(1, 9);
        q = `${a} - ${b} × ${c} = ?`;
        ans = a - b * c;
    }
    return { q, ans };
}

export function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
}

export const DIFFICULTY = [
    { name: 'Basic', gen: genBasic, time: 20 },
    { name: 'Medium', gen: genMedium, time: 30 },
    { name: 'Advanced', gen: genAdvanced, time: 40 }
];
