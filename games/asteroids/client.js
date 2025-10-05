const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const playersEl = document.getElementById('players');
const statusEl = document.getElementById('connectionStatus');

// Game state
const keys = {};
let myId = null;
let players = {};
let asteroids = [];
let bullets = [];
let score = 0;
let lives = 3;
let level = 1;
let ws = null;
let lastSend = 0;
const INPUT_INTERVAL_MS = 33; // ~30Hz


// Constants
const SHIP_SIZE = 10;
const SHIP_THRUST = 0.15;
const SHIP_TURN_SPEED = 0.08;
const SHIP_FRICTION = 0.98;
const BULLET_SPEED = 7;
const BULLET_LIFETIME = 60;

// Player colors
const PLAYER_COLORS = ['#0f0', '#0ff', '#ff0', '#f0f', '#f80', '#0f8'];

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
        statusEl.textContent = 'Disconnected - Reconnecting...';
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
            asteroids = data.asteroids;
            bullets = data.bullets;
            break;
        case 'players':
            players = data.players;
            playersEl.textContent = `Players: ${Object.keys(players).length}`;
            break;
        case 'gameState':
            asteroids = data.asteroids;
            bullets = data.bullets;
            if (data.level !== undefined) {
                level = data.level;
                levelEl.textContent = `Level: ${level}`;
            }
            if (data.players[myId]) {
                score = data.players[myId].score || 0;
                lives = data.players[myId].lives !== undefined ? data.players[myId].lives : 3;
                scoreEl.textContent = `Score: ${score}`;
                livesEl.textContent = `Lives: ${lives}`;
            }
            // Update other players
            for (let id in data.players) {
                if (players[id]) {
                    players[id] = data.players[id];
                }
            }
            break;
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

// Input handling
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ') e.preventDefault();
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Mobile detection and setup
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                 ('ontouchstart' in window) ||
                 (navigator.maxTouchPoints > 0);

// Mouse controls for desktop only
if (!isMobile) {
    canvas.addEventListener('mousedown', (e) => {
        keys[' '] = true;
    });

    canvas.addEventListener('mouseup', (e) => {
        keys[' '] = false;
    });

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

if (isMobile) {
    // Show touch controls
    const controlsEl = document.getElementById('controls');
    const controlHint = document.getElementById('controlHint');
    if (controlsEl) controlsEl.classList.add('mobile');
    if (controlHint) controlHint.textContent = 'Use touch controls';

    // Touch control handlers
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const btnUp = document.getElementById('btnUp');
    const btnFire = document.getElementById('btnFire');

    function setupTouchButton(btn, keyName) {
        if (!btn) return; // Safety check

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            keys[keyName] = true;
            btn.classList.add('active');
        });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            keys[keyName] = false;
            btn.classList.remove('active');
        });

        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            keys[keyName] = false;
            btn.classList.remove('active');
        });
    }

    setupTouchButton(btnLeft, 'ArrowLeft');
    setupTouchButton(btnRight, 'ArrowRight');
    setupTouchButton(btnUp, 'ArrowUp');
    setupTouchButton(btnFire, ' ');

    // Resize canvas for mobile
    function resizeCanvas() {
        const maxWidth = window.innerWidth - 20;
        const maxHeight = window.innerHeight * 0.6;
        const aspectRatio = 800 / 600;

        if (maxWidth / maxHeight > aspectRatio) {
            canvas.style.height = maxHeight + 'px';
            canvas.style.width = (maxHeight * aspectRatio) + 'px';
        } else {
            canvas.style.width = maxWidth + 'px';
            canvas.style.height = (maxWidth / aspectRatio) + 'px';
        }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
}

// Drawing functions
function drawShip(x, y, angle, color, thrust, respawning) {
    // Flashing effect while respawning
    if (respawning && Math.floor(Date.now() / 100) % 2 === 0) {
        return; // Skip drawing to create flashing effect
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Ship body
    ctx.strokeStyle = respawning ? '#f00' : color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE, 0);
    ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE);
    ctx.lineTo(-SHIP_SIZE * 0.5, 0);
    ctx.lineTo(-SHIP_SIZE, SHIP_SIZE);
    ctx.closePath();
    ctx.stroke();

    // Thrust flame
    if (thrust && !respawning) {
        ctx.strokeStyle = '#f80';
        ctx.beginPath();
        ctx.moveTo(-SHIP_SIZE * 0.5, -SHIP_SIZE * 0.5);
        ctx.lineTo(-SHIP_SIZE * 1.5, 0);
        ctx.lineTo(-SHIP_SIZE * 0.5, SHIP_SIZE * 0.5);
        ctx.stroke();
    }

    ctx.restore();
}

function drawAsteroid(asteroid) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const points = asteroid.points || 8;
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const radius = asteroid.size + Math.sin(i) * (asteroid.size * 0.2);
        const x = asteroid.x + Math.cos(angle) * radius;
        const y = asteroid.y + Math.sin(angle) * radius;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.closePath();
    ctx.stroke();
}

function drawBullet(bullet) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
    ctx.fill();
}

function render() {
    // Clear screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw asteroids
    asteroids.forEach(asteroid => drawAsteroid(asteroid));

    // Draw bullets
    bullets.forEach(bullet => drawBullet(bullet));

    // Draw all players
    let colorIndex = 0;
    for (let id in players) {
        const player = players[id];
        const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
        const isThrusting = player.thrust || false;
        const isRespawning = player.respawnTimer > 0;
        drawShip(player.x, player.y, player.angle, color, isThrusting, isRespawning);

        // Draw player name
        ctx.fillStyle = color;
        ctx.font = '12px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(`P${colorIndex + 1}`, player.x, player.y - 20);

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
