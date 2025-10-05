const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const roomEl = document.getElementById('room');
const statusEl = document.getElementById('connectionStatus');

// Game state
const keys = {};
let player = { x: 320, y: 240, angle: 0, speed: 3, alive: true };
let robots = [];
let bullets = [];
let walls = [];
let exits = [];
let evilOtto = null;
let score = 0;
let lives = 3;
let room = 1;
let gameOver = false;
let fireTimer = 0;
let roomTimer = 0;
const ROOM_TIME_LIMIT = 1200; // 20 seconds at 60fps

// Constants
const TILE_SIZE = 32;

// Initialize game
function init() {
    statusEl.textContent = 'Single Player';
    statusEl.classList.remove('disconnected');
    generateRoom();
    gameLoop();
}

// Generate random maze room
function generateRoom() {
    walls = [];
    robots = [];
    bullets = [];
    evilOtto = null;
    roomTimer = 0;

    // Room borders
    walls.push({ x: 0, y: 0, width: canvas.width, height: 10 });
    walls.push({ x: 0, y: canvas.height - 10, width: canvas.width, height: 10 });
    walls.push({ x: 0, y: 0, width: 10, height: canvas.height });
    walls.push({ x: canvas.width - 10, y: 0, width: 10, height: canvas.height });

    // Random interior walls
    const numWalls = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numWalls; i++) {
        const horizontal = Math.random() < 0.5;
        if (horizontal) {
            walls.push({
                x: 50 + Math.random() * (canvas.width - 150),
                y: 50 + Math.random() * (canvas.height - 100),
                width: 80 + Math.random() * 120,
                height: 10
            });
        } else {
            walls.push({
                x: 50 + Math.random() * (canvas.width - 100),
                y: 50 + Math.random() * (canvas.height - 150),
                width: 10,
                height: 80 + Math.random() * 120
            });
        }
    }

    // Exits (4 sides)
    exits = [
        { x: canvas.width - 15, y: canvas.height / 2 - 30, width: 15, height: 60, side: 'right' },
        { x: 0, y: canvas.height / 2 - 30, width: 15, height: 60, side: 'left' },
        { x: canvas.width / 2 - 30, y: 0, width: 60, height: 15, side: 'top' },
        { x: canvas.width / 2 - 30, y: canvas.height - 15, width: 60, height: 15, side: 'bottom' }
    ];

    // Spawn robots
    const numRobots = 3 + Math.floor(room / 2);
    for (let i = 0; i < numRobots; i++) {
        let rx, ry;
        let attempts = 0;
        do {
            rx = 100 + Math.random() * (canvas.width - 200);
            ry = 100 + Math.random() * (canvas.height - 200);
            attempts++;
        } while (attempts < 20 && (Math.abs(rx - player.x) < 100 || Math.abs(ry - player.y) < 100));

        robots.push({
            x: rx,
            y: ry,
            speed: 1 + room * 0.1,
            color: ['#f00', '#f80', '#f0f'][Math.floor(Math.random() * 3)],
            fireTimer: Math.floor(Math.random() * 60)
        });
    }
}

// Input handling
window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Check collision with walls
function checkWallCollision(x, y, size = 10) {
    return walls.some(wall =>
        x + size > wall.x && x - size < wall.x + wall.width &&
        y + size > wall.y && y - size < wall.y + wall.height
    );
}

// Update game state
function update() {
    if (gameOver) return;

    roomTimer++;

    // Spawn Evil Otto if taking too long
    if (roomTimer > ROOM_TIME_LIMIT && !evilOtto) {
        evilOtto = { x: 10, y: 10, speed: 2 };
    }

    // Update player
    let newX = player.x;
    let newY = player.y;

    if (keys['ArrowUp']) newY -= player.speed;
    if (keys['ArrowDown']) newY += player.speed;
    if (keys['ArrowLeft']) newX -= player.speed;
    if (keys['ArrowRight']) newX += player.speed;

    if (!checkWallCollision(newX, newY, 10)) {
        player.x = newX;
        player.y = newY;
    }

    // Player angle based on last movement
    if (keys['ArrowUp']) player.angle = -Math.PI / 2;
    else if (keys['ArrowDown']) player.angle = Math.PI / 2;
    else if (keys['ArrowLeft']) player.angle = Math.PI;
    else if (keys['ArrowRight']) player.angle = 0;

    // Player shooting
    fireTimer = Math.max(0, fireTimer - 1);
    if (keys[' '] && fireTimer === 0) {
        bullets.push({
            x: player.x,
            y: player.y,
            vx: Math.cos(player.angle) * 6,
            vy: Math.sin(player.angle) * 6,
            fromPlayer: true
        });
        fireTimer = 20;
    }

    // Check exit collision
    exits.forEach(exit => {
        if (player.x > exit.x && player.x < exit.x + exit.width &&
            player.y > exit.y && player.y < exit.y + exit.height) {
            room++;
            roomEl.textContent = `Room: ${room}`;
            score += 10;
            scoreEl.textContent = `Score: ${score}`;
            player.x = canvas.width / 2;
            player.y = canvas.height / 2;
            generateRoom();
        }
    });

    // Update robots
    robots.forEach((robot, idx) => {
        // Chase player
        const dx = player.x - robot.x;
        const dy = player.y - robot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const moveX = robot.x + (dx / dist) * robot.speed;
            const moveY = robot.y + (dy / dist) * robot.speed;

            if (!checkWallCollision(moveX, moveY, 10)) {
                robot.x = moveX;
                robot.y = moveY;
            }
        }

        // Robot shooting
        robot.fireTimer--;
        if (robot.fireTimer <= 0 && dist < 300) {
            const angle = Math.atan2(dy, dx);
            bullets.push({
                x: robot.x,
                y: robot.y,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 3,
                fromPlayer: false
            });
            robot.fireTimer = 80 - room * 3;
        }

        // Robot collision with player
        if (Math.abs(robot.x - player.x) < 20 && Math.abs(robot.y - player.y) < 20) {
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            player.x = canvas.width / 2;
            player.y = canvas.height / 2;
            if (lives <= 0) {
                gameOver = true;
                statusEl.textContent = 'GAME OVER - Press R to restart';
                statusEl.classList.add('disconnected');
            }
        }
    });

    // Update Evil Otto
    if (evilOtto) {
        const dx = player.x - evilOtto.x;
        const dy = player.y - evilOtto.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            evilOtto.x += (dx / dist) * evilOtto.speed;
            evilOtto.y += (dy / dist) * evilOtto.speed;
        }

        // Evil Otto collision (instant death)
        if (Math.abs(evilOtto.x - player.x) < 20 && Math.abs(evilOtto.y - player.y) < 20) {
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            player.x = canvas.width / 2;
            player.y = canvas.height / 2;
            if (lives <= 0) {
                gameOver = true;
                statusEl.textContent = 'GAME OVER - Press R to restart';
                statusEl.classList.add('disconnected');
            } else {
                room++;
                roomEl.textContent = `Room: ${room}`;
                generateRoom();
            }
        }
    }

    // Update bullets
    bullets = bullets.filter((bullet, idx) => {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;

        // Wall collision
        if (checkWallCollision(bullet.x, bullet.y, 2)) return false;

        // Out of bounds
        if (bullet.x < 0 || bullet.x > canvas.width || bullet.y < 0 || bullet.y > canvas.height) return false;

        // Bullet vs robot
        if (bullet.fromPlayer) {
            for (let i = robots.length - 1; i >= 0; i--) {
                if (Math.abs(bullet.x - robots[i].x) < 15 && Math.abs(bullet.y - robots[i].y) < 15) {
                    robots.splice(i, 1);
                    score += 50;
                    scoreEl.textContent = `Score: ${score}`;
                    return false;
                }
            }
        }

        // Bullet vs player
        if (!bullet.fromPlayer && Math.abs(bullet.x - player.x) < 15 && Math.abs(bullet.y - player.y) < 15) {
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            player.x = canvas.width / 2;
            player.y = canvas.height / 2;
            if (lives <= 0) {
                gameOver = true;
                statusEl.textContent = 'GAME OVER - Press R to restart';
                statusEl.classList.add('disconnected');
            }
            return false;
        }

        return true;
    });
}

// Drawing functions
function drawPlayer(p, color) {
    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    // Head
    ctx.beginPath();
    ctx.arc(0, -12, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 8);
    ctx.stroke();

    // Arms (pointing gun direction)
    const armX = Math.cos(p.angle) * 10;
    const armY = Math.sin(p.angle) * 10;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(armX, armY);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(-6, 18);
    ctx.moveTo(0, 8);
    ctx.lineTo(6, 18);
    ctx.stroke();

    ctx.restore();
}

function drawRobot(robot) {
    ctx.save();
    ctx.translate(robot.x, robot.y);

    ctx.fillStyle = robot.color || '#f00';
    ctx.fillRect(-10, -10, 20, 20);

    ctx.fillStyle = '#ff0';
    ctx.fillRect(-6, -16, 12, 6);

    ctx.fillStyle = '#f00';
    ctx.fillRect(-5, -14, 3, 3);
    ctx.fillRect(2, -14, 3, 3);

    ctx.fillStyle = robot.color || '#f00';
    ctx.fillRect(-14, -6, 4, 8);
    ctx.fillRect(10, -6, 4, 8);

    ctx.fillRect(-8, 10, 6, 8);
    ctx.fillRect(2, 10, 6, 8);

    ctx.restore();
}

function drawEvilOtto(otto) {
    if (!otto) return;

    ctx.save();
    ctx.translate(otto.x, otto.y);

    const bounce = Math.sin(Date.now() / 100) * 3;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, bounce, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, bounce, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.fillRect(-6, bounce - 6, 4, 4);
    ctx.fillRect(2, bounce - 6, 4, 4);

    ctx.restore();
}

function drawWall(wall) {
    ctx.fillStyle = '#0f0';
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.strokeStyle = '#0ff';
    ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
}

function drawExit(exit) {
    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.fillRect(exit.x, exit.y, exit.width, exit.height);
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2;
    ctx.strokeRect(exit.x, exit.y, exit.width, exit.height);
}

function drawBullet(bullet) {
    ctx.fillStyle = bullet.fromPlayer ? '#fff' : '#f00';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fill();
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    walls.forEach(wall => drawWall(wall));
    exits.forEach(exit => drawExit(exit));
    bullets.forEach(bullet => drawBullet(bullet));
    robots.forEach(robot => drawRobot(robot));

    if (evilOtto) {
        drawEvilOtto(evilOtto);
    }

    if (!gameOver && player.alive) {
        drawPlayer(player, '#0f0');
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
            room = 1;
            player.x = 320;
            player.y = 240;
            player.alive = true;
            scoreEl.textContent = `Score: ${score}`;
            livesEl.textContent = `Lives: ${lives}`;
            roomEl.textContent = `Room: ${room}`;
            statusEl.textContent = 'Single Player';
            statusEl.classList.remove('disconnected');
            generateRoom();
        }
    }
});

// Start the game
init();
