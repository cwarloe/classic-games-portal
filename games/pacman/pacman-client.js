const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const statusEl = document.getElementById('connectionStatus');

// Game state
const keys = {};
let player = { x: 1, y: 1, dir: 0, nextDir: 0, speed: 0.1, mouth: 0 };
let pellets = [];
let powerPellets = [];
let ghosts = [];
let score = 0;
let lives = 3;
let gameOver = false;
let powerMode = false;
let powerTimer = 0;
let level = 1;

// Constants
const TILE_SIZE = 20;
const GHOST_COLORS = ['#f00', '#0ff', '#f8f', '#f80'];
const GHOST_NAMES = ['Blinky', 'Inky', 'Pinky', 'Clyde'];

// Maze layout (1 = wall, 0 = path, 2 = pellet, 3 = power pellet)
const maze = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,3,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,3,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
    [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,0,0,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [0,0,0,0,0,0,2,0,0,0,1,0,0,0,0,0,0,1,0,0,0,2,0,0,0,0,0,0],
    [1,1,1,1,1,1,2,1,1,0,1,0,0,0,0,0,0,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
    [1,3,2,2,1,1,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,1,1,2,2,3,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Initialize game
function init() {
    statusEl.textContent = 'Single Player';
    statusEl.classList.remove('disconnected');
    initLevel();
    gameLoop();
}

function initLevel() {
    pellets = [];
    powerPellets = [];

    // Collect pellets from maze
    for (let row = 0; row < maze.length; row++) {
        for (let col = 0; col < maze[row].length; col++) {
            if (maze[row][col] === 2) {
                pellets.push({ x: col, y: row });
            } else if (maze[row][col] === 3) {
                powerPellets.push({ x: col, y: row });
            }
        }
    }

    // Initialize ghosts
    ghosts = [
        { x: 13, y: 11, dir: 0, color: GHOST_COLORS[0], mode: 'chase' },
        { x: 14, y: 11, dir: 0, color: GHOST_COLORS[1], mode: 'scatter' },
        { x: 13, y: 13, dir: 0, color: GHOST_COLORS[2], mode: 'ambush' },
        { x: 14, y: 13, dir: 0, color: GHOST_COLORS[3], mode: 'random' }
    ];

    player = { x: 14, y: 23, dir: 0, nextDir: 0, speed: 0.12, mouth: 0 };
    powerMode = false;
    powerTimer = 0;
}

// Input handling
window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

function getTile(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (row < 0 || row >= maze.length || col < 0 || col >= maze[0].length) return 1;
    return maze[row][col];
}

function canMove(x, y) {
    const tile = getTile(x, y);
    return tile !== 1;
}

// Update game state
function update() {
    if (gameOver) return;

    // Handle input for direction change
    if (keys['ArrowUp']) player.nextDir = 1;
    if (keys['ArrowDown']) player.nextDir = 2;
    if (keys['ArrowLeft']) player.nextDir = 3;
    if (keys['ArrowRight']) player.nextDir = 0;

    // Try to change direction
    let testX = player.x;
    let testY = player.y;
    if (player.nextDir === 0) testX += player.speed;
    else if (player.nextDir === 1) testY -= player.speed;
    else if (player.nextDir === 2) testY += player.speed;
    else if (player.nextDir === 3) testX -= player.speed;

    if (canMove(testX, testY)) {
        player.dir = player.nextDir;
    }

    // Move player
    let newX = player.x;
    let newY = player.y;
    if (player.dir === 0) newX += player.speed;
    else if (player.dir === 1) newY -= player.speed;
    else if (player.dir === 2) newY += player.speed;
    else if (player.dir === 3) newX -= player.speed;

    if (canMove(newX, newY)) {
        player.x = newX;
        player.y = newY;
    }

    // Tunnel wrap
    if (player.x < 0) player.x = maze[0].length - 1;
    if (player.x >= maze[0].length) player.x = 0;

    // Animate mouth
    player.mouth = (player.mouth + 0.2) % (Math.PI * 2);

    // Check pellet collection
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);

    for (let i = pellets.length - 1; i >= 0; i--) {
        if (pellets[i].x === px && pellets[i].y === py) {
            pellets.splice(i, 1);
            score += 10;
            scoreEl.textContent = `Score: ${score}`;
        }
    }

    for (let i = powerPellets.length - 1; i >= 0; i--) {
        if (powerPellets[i].x === px && powerPellets[i].y === py) {
            powerPellets.splice(i, 1);
            score += 50;
            scoreEl.textContent = `Score: ${score}`;
            powerMode = true;
            powerTimer = 300;
        }
    }

    // Power mode timer
    if (powerMode) {
        powerTimer--;
        if (powerTimer <= 0) {
            powerMode = false;
        }
    }

    // Update ghosts
    const ghostSpeed = 0.08 * (1 + level * 0.05);
    ghosts.forEach((ghost, idx) => {
        // Simple ghost AI
        let targetX = player.x;
        let targetY = player.y;

        if (powerMode) {
            // Run away from player
            targetX = ghost.x + (ghost.x - player.x);
            targetY = ghost.y + (ghost.y - player.y);
        } else {
            // Different behaviors
            if (ghost.mode === 'scatter') {
                targetX = idx * 7;
                targetY = idx * 7;
            } else if (ghost.mode === 'ambush') {
                targetX = player.x + (player.dir === 0 ? 4 : player.dir === 3 ? -4 : 0);
                targetY = player.y + (player.dir === 1 ? -4 : player.dir === 2 ? 4 : 0);
            } else if (ghost.mode === 'random' && Math.random() < 0.1) {
                targetX = Math.random() * maze[0].length;
                targetY = Math.random() * maze.length;
            }
        }

        // Calculate best direction
        const dirs = [
            { dx: ghostSpeed, dy: 0, dir: 0 },
            { dx: 0, dy: -ghostSpeed, dir: 1 },
            { dx: 0, dy: ghostSpeed, dir: 2 },
            { dx: -ghostSpeed, dy: 0, dir: 3 }
        ];

        let bestDist = Infinity;
        let bestDir = ghost.dir;

        dirs.forEach(d => {
            if (d.dir !== (ghost.dir + 2) % 4) { // Don't reverse
                const testX = ghost.x + d.dx;
                const testY = ghost.y + d.dy;
                if (canMove(testX, testY)) {
                    const dist = Math.abs(testX - targetX) + Math.abs(testY - targetY);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestDir = d.dir;
                    }
                }
            }
        });

        ghost.dir = bestDir;
        if (ghost.dir === 0) ghost.x += ghostSpeed;
        else if (ghost.dir === 1) ghost.y -= ghostSpeed;
        else if (ghost.dir === 2) ghost.y += ghostSpeed;
        else if (ghost.dir === 3) ghost.x -= ghostSpeed;

        // Tunnel wrap
        if (ghost.x < 0) ghost.x = maze[0].length - 1;
        if (ghost.x >= maze[0].length) ghost.x = 0;

        // Collision with player
        const dist = Math.abs(ghost.x - player.x) + Math.abs(ghost.y - player.y);
        if (dist < 0.5) {
            if (powerMode) {
                // Eat ghost
                score += 200;
                scoreEl.textContent = `Score: ${score}`;
                ghost.x = 13 + idx % 2;
                ghost.y = 13;
            } else {
                // Lose life
                lives--;
                livesEl.textContent = `Lives: ${lives}`;
                player.x = 14;
                player.y = 23;
                if (lives <= 0) {
                    gameOver = true;
                    statusEl.textContent = 'GAME OVER - Press R to restart';
                    statusEl.classList.add('disconnected');
                }
            }
        }
    });

    // Check level complete
    if (pellets.length === 0 && powerPellets.length === 0) {
        level++;
        initLevel();
    }
}

// Drawing functions
function drawMaze() {
    for (let row = 0; row < maze.length; row++) {
        for (let col = 0; col < maze[row].length; col++) {
            if (maze[row][col] === 1) {
                ctx.fillStyle = '#00f';
                ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

function drawPellets() {
    ctx.fillStyle = '#fff';
    pellets.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    powerPellets.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2, 5, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawPlayer() {
    ctx.save();
    ctx.translate(player.x * TILE_SIZE + TILE_SIZE / 2, player.y * TILE_SIZE + TILE_SIZE / 2);
    ctx.rotate(player.dir * Math.PI / 2);

    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    const mouthAngle = Math.abs(Math.sin(player.mouth)) * 0.3;
    ctx.arc(0, 0, TILE_SIZE / 2 - 2, mouthAngle, Math.PI * 2 - mouthAngle);
    ctx.lineTo(0, 0);
    ctx.fill();

    ctx.restore();
}

function drawGhost(ghost) {
    ctx.save();
    ctx.translate(ghost.x * TILE_SIZE + TILE_SIZE / 2, ghost.y * TILE_SIZE + TILE_SIZE / 2);

    if (powerMode) {
        ctx.fillStyle = '#00f';
    } else {
        ctx.fillStyle = ghost.color;
    }

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, TILE_SIZE / 2 - 2, Math.PI, 0);
    ctx.lineTo(TILE_SIZE / 2 - 2, TILE_SIZE / 2);
    ctx.lineTo(TILE_SIZE / 3, TILE_SIZE / 3);
    ctx.lineTo(0, TILE_SIZE / 2);
    ctx.lineTo(-TILE_SIZE / 3, TILE_SIZE / 3);
    ctx.lineTo(-TILE_SIZE / 2 + 2, TILE_SIZE / 2);
    ctx.closePath();
    ctx.fill();

    // Eyes
    if (!powerMode) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-3, -2, 3, 0, Math.PI * 2);
        ctx.arc(3, -2, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#00f';
        ctx.beginPath();
        ctx.arc(-3, -2, 1.5, 0, Math.PI * 2);
        ctx.arc(3, -2, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMaze();
    drawPellets();
    ghosts.forEach(ghost => drawGhost(ghost));

    if (!gameOver) {
        drawPlayer();
    }

    if (gameOver) {
        ctx.fillStyle = '#fff';
        ctx.font = '30px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        ctx.font = '16px "Courier New"';
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 40);
    }
}

// Game loop
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// Restart on R key
window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        if (gameOver) {
            gameOver = false;
            score = 0;
            lives = 3;
            level = 1;
            scoreEl.textContent = `Score: ${score}`;
            livesEl.textContent = `Lives: ${lives}`;
            statusEl.textContent = 'Single Player';
            statusEl.classList.remove('disconnected');
            initLevel();
        }
    }
});

// Start the game
init();
