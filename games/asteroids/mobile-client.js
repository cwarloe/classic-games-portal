const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const playersEl = document.getElementById('players');
const statusEl = document.getElementById('connectionStatus');

// Mobile controls
const joystickEl = document.getElementById('joystick');
const joystickKnobEl = document.getElementById('joystickKnob');
const fireButtonEl = document.getElementById('fireButton');
const controlModeToggleEl = document.getElementById('controlModeToggle');
const fullscreenBtnEl = document.getElementById('fullscreenBtn');

// Game state
const keys = {};
let myId = null;
let players = {};
let asteroids = [];
let bullets = [];
let score = 0;
let ws = null;
let lastSend = 0;
const INPUT_INTERVAL_MS = 33; // ~30Hz

// Mobile control state
let joystickActive = false;
let joystickStartX = 0;
let joystickStartY = 0;
let joystickAngle = 0;
let joystickDistance = 0;
let fireActive = false;
let controlMode = 'joystick'; // 'joystick' or 'tilt'
let tiltX = 0;
let tiltY = 0;
let volumeButtonFire = false;

// Constants
const SHIP_SIZE = 10;
const PLAYER_COLORS = ['#0f0', '#0ff', '#ff0', '#f0f', '#f80', '#0f8'];

// Resize canvas to fill screen
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// WebSocket connection
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
        statusEl.textContent = 'Connected';
        statusEl.classList.remove('disconnected');
    };

    ws.onclose = () => {
        statusEl.textContent = 'Disconnected';
        statusEl.classList.add('disconnected');
        setTimeout(connect, 2000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
}

function handleServerMessage(data) {
    switch(data.type) {
        case 'init':
            myId = data.id;
            players = data.players;
            asteroids = data.asteroids || [];
            bullets = data.bullets || [];
            break;
        case 'players':
            players = data.players;
            playersEl.textContent = `Players: ${Object.keys(players).length}`;
            break;
        case 'gameState':
            asteroids = data.asteroids || [];
            bullets = data.bullets || [];
            if (data.players[myId]) {
                score = data.players[myId].score || 0;
                scoreEl.textContent = `Score: ${score}`;
            }
            for (let id in data.players) {
                if (players[id]) {
                    players[id] = data.players[id];
                }
            }
            break;
    }
}

// Joystick controls
joystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = joystickEl.getBoundingClientRect();
    joystickStartX = rect.left + rect.width / 2;
    joystickStartY = rect.top + rect.height / 2;
    joystickActive = true;
    updateJoystick(touch.clientX, touch.clientY);
}, { passive: false });

joystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (joystickActive) {
        const touch = e.touches[0];
        updateJoystick(touch.clientX, touch.clientY);
    }
}, { passive: false });

joystickEl.addEventListener('touchend', (e) => {
    e.preventDefault();
    joystickActive = false;
    joystickKnobEl.style.transform = 'translate(-50%, -50%)';
    keys['ArrowLeft'] = false;
    keys['ArrowRight'] = false;
    keys['ArrowUp'] = false;
}, { passive: false });

function updateJoystick(x, y) {
    const dx = x - joystickStartX;
    const dy = y - joystickStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const maxDistance = 40;
    joystickDistance = Math.min(distance, maxDistance);
    joystickAngle = angle;

    const knobX = Math.cos(angle) * joystickDistance;
    const knobY = Math.sin(angle) * joystickDistance;
    joystickKnobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

    // Convert to key presses
    keys['ArrowUp'] = joystickDistance > 10;

    const angleDeg = (angle * 180 / Math.PI + 360) % 360;
    keys['ArrowLeft'] = angleDeg > 120 && angleDeg < 240;
    keys['ArrowRight'] = angleDeg < 60 || angleDeg > 300;
}

// Fire button
fireButtonEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fireActive = true;
    keys[' '] = true;
    fireButtonEl.classList.add('active');
    vibrate(10);
}, { passive: false });

fireButtonEl.addEventListener('touchend', (e) => {
    e.preventDefault();
    fireActive = false;
    keys[' '] = false;
    fireButtonEl.classList.remove('active');
}, { passive: false });

// Control mode toggle
controlModeToggleEl.addEventListener('click', () => {
    controlMode = controlMode === 'joystick' ? 'tilt' : 'joystick';
    controlModeToggleEl.textContent = controlMode === 'joystick' ? '🕹️ Joystick' : '📱 Tilt';

    if (controlMode === 'tilt') {
        joystickEl.style.display = 'none';
        requestTiltPermission();
    } else {
        joystickEl.style.display = 'flex';
    }
});

// Tilt controls
function requestTiltPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleTilt);
                }
            })
            .catch(console.error);
    } else {
        window.addEventListener('deviceorientation', handleTilt);
    }
}

function handleTilt(event) {
    if (controlMode !== 'tilt') return;

    // beta: front-to-back tilt (-180 to 180)
    // gamma: left-to-right tilt (-90 to 90)
    tiltX = event.gamma / 45; // -2 to 2
    tiltY = event.beta / 45;

    keys['ArrowLeft'] = tiltX < -0.3;
    keys['ArrowRight'] = tiltX > 0.3;
    keys['ArrowUp'] = tiltY > 0.3 && tiltY < 1;
}

// Volume buttons for firing (experimental)
document.addEventListener('volumeup', () => {
    keys[' '] = true;
    setTimeout(() => { keys[' '] = false; }, 100);
});

document.addEventListener('volumedown', () => {
    keys[' '] = true;
    setTimeout(() => { keys[' '] = false; }, 100);
});

// Fullscreen
fullscreenBtnEl.addEventListener('click', () => {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
    }
});

// Vibration
function vibrate(duration) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
}

function sendInput() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - lastSend < INPUT_INTERVAL_MS) return;
    lastSend = now;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'input',
            keys: {
                left: keys['ArrowLeft'] || false,
                right: keys['ArrowRight'] || false,
                up: keys['ArrowUp'] || false,
                space: keys[' '] || false
            }
        }));
    }
}

// Drawing functions
function drawShip(x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE, 0);
    ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE);
    ctx.lineTo(-SHIP_SIZE / 2, 0);
    ctx.lineTo(-SHIP_SIZE, SHIP_SIZE);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
}

function drawAsteroid(asteroid) {
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.rotation || 0);

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sides = 8;
    for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const radius = asteroid.size + Math.sin(i * 2.3) * (asteroid.size * 0.2);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
}

function drawBullet(bullet) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
    ctx.fill();
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stars
    ctx.fillStyle = '#444';
    for (let i = 0; i < 100; i++) {
        const x = (i * 1234.5) % canvas.width;
        const y = (i * 5678.9) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
    }

    // Draw asteroids
    asteroids.forEach(asteroid => drawAsteroid(asteroid));

    // Draw bullets
    bullets.forEach(bullet => drawBullet(bullet));

    // Draw all players
    let colorIndex = 0;
    for (let id in players) {
        const player = players[id];
        if (player && player.x !== undefined) {
            const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
            drawShip(player.x, player.y, player.angle || 0, color);
        }
        colorIndex++;
    }
}

// Game loop
function gameLoop() {
    sendInput();
    render();
    requestAnimationFrame(gameLoop);
}

// Start the game
connect();
gameLoop();
