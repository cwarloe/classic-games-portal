const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');

// Game state
const keys = {};
let player = { x: 350, y: 550, width: 30, height: 20, speed: 4 };
let invaders = [];
let bullets = [];
let invaderBullets = [];
let bunkers = [];
let score = 0;
let lives = 3;
let level = 1;
let gameOver = false;
let invaderDirection = 1;
let invaderSpeed = 1.5;
let invaderDropDistance = 15;
let fireTimer = 0;
let invaderFireTimer = 60;
let moveTimer = 0;

// Initialize
function init() {
    spawnInvaders();
    spawnBunkers();
    gameLoop();
}

// Spawn invader formation
function spawnInvaders() {
    invaders = [];
    const rows = 5;
    const cols = 11;
    const spacing = 50;
    const startX = 50;
    const startY = 80;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let type = 'squid';
            let points = 10;
            if (row === 0) { type = 'octopus'; points = 30; }
            else if (row < 3) { type = 'crab'; points = 20; }

            invaders.push({
                x: startX + col * spacing,
                y: startY + row * spacing,
                width: 32,
                height: 24,
                type: type,
                points: points,
                alive: true,
                frame: 0
            });
        }
    }

    invaderSpeed = 1.5 + level * 0.3;
    invaderFireTimer = 60;
}

// Spawn bunkers (shields)
function spawnBunkers() {
    bunkers = [];
    const bunkerY = 450;
    const bunkerPositions = [100, 250, 400, 550];

    bunkerPositions.forEach(x => {
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 6; col++) {
                bunkers.push({
                    x: x + col * 8,
                    y: bunkerY + row * 8,
                    width: 8,
                    height: 8,
                    health: 3
                });
            }
        }
    });
}

// Input
window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Update
function update() {
    if (gameOver) return;

    // Player movement
    if (keys['ArrowLeft'] && player.x > 0) player.x -= player.speed;
    if (keys['ArrowRight'] && player.x < canvas.width - player.width) player.x += player.speed;

    // Player shooting
    fireTimer = Math.max(0, fireTimer - 1);
    if (keys[' '] && fireTimer === 0 && bullets.filter(b => b.fromPlayer).length < 3) {
        bullets.push({
            x: player.x + player.width / 2,
            y: player.y,
            width: 4,
            height: 12,
            speed: 8,
            fromPlayer: true
        });
        fireTimer = 20;
        sound.play('shoot');
    }

    // Update bullets
    bullets = bullets.filter(b => {
        if (b.fromPlayer) {
            b.y -= b.speed;
            return b.y > -b.height;
        }
        return true;
    });

    // Update invader bullets
    invaderBullets = invaderBullets.filter(b => {
        b.y += b.speed;
        return b.y < canvas.height;
    });

    // Update invaders
    let moveDown = false;
    let leftmost = canvas.width;
    let rightmost = 0;

    invaders.forEach((inv, idx) => {
        if (!inv.alive) return;

        inv.frame = (inv.frame + 0.1) % 2;

        if (inv.x < leftmost) leftmost = inv.x;
        if (inv.x + inv.width > rightmost) rightmost = inv.x + inv.width;
    });

    // Check if invaders hit edges
    if ((invaderDirection > 0 && rightmost >= canvas.width) ||
        (invaderDirection < 0 && leftmost <= 0)) {
        moveDown = true;
        invaderDirection *= -1;
    }

    // Move invaders (stepped movement for classic feel)
    moveTimer++;
    if (moveTimer > 30) {
        moveTimer = 0;
        invaders.forEach(inv => {
            if (!inv.alive) return;

            if (moveDown) {
                inv.y += invaderDropDistance;
            }
            inv.x += invaderDirection * 10; // Stepped movement
        });
    }

    // Invader shooting
    invaderFireTimer--;
    if (invaderFireTimer <= 0) {
        const aliveInvaders = invaders.filter(inv => inv.alive);
        if (aliveInvaders.length > 0) {
            const shooter = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)];
            invaderBullets.push({
                x: shooter.x + shooter.width / 2,
                y: shooter.y + shooter.height,
                width: 4,
                height: 12,
                speed: 3 + level * 0.3
            });
        }
        invaderFireTimer = Math.max(20, 60 - level * 5);
    }

    // Collision: player bullets vs invaders
    bullets.forEach((bullet, bIdx) => {
        if (!bullet.fromPlayer) return;

        invaders.forEach((inv, iIdx) => {
            if (!inv.alive) return;

            if (bullet.x > inv.x && bullet.x < inv.x + inv.width &&
                bullet.y > inv.y && bullet.y < inv.y + inv.height) {
                bullets.splice(bIdx, 1);
                inv.alive = false;
                score += inv.points;
                scoreEl.textContent = `Score: ${score}`;
                sound.play('explosion');
            }
        });
    });

    // Collision: bullets vs bunkers
    [...bullets, ...invaderBullets].forEach((bullet, bIdx) => {
        bunkers.forEach((bunker, idx) => {
            if (bunker.health <= 0) return;

            if (bullet.x > bunker.x && bullet.x < bunker.x + bunker.width &&
                bullet.y > bunker.y && bullet.y < bunker.y + bunker.height) {
                bunker.health--;
                if (bullet.fromPlayer) {
                    bullets.splice(bIdx, 1);
                } else {
                    invaderBullets.splice(bIdx - bullets.length, 1);
                }
            }
        });
    });

    // Collision: invader bullets vs player
    invaderBullets.forEach((bullet, idx) => {
        if (bullet.x > player.x && bullet.x < player.x + player.width &&
            bullet.y > player.y && bullet.y < player.y + player.height) {
            invaderBullets.splice(idx, 1);
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            sound.play('hit');
            if (lives <= 0) {
                gameOver = true;
                sound.play('death');
            }
        }
    });

    // Check if invaders reached bottom
    invaders.forEach(inv => {
        if (inv.alive && inv.y + inv.height >= player.y) {
            gameOver = true;
            sound.play('death');
        }
    });

    // Check level complete
    if (invaders.every(inv => !inv.alive)) {
        level++;
        levelEl.textContent = `Level: ${level}`;
        spawnInvaders();
        spawnBunkers();
        bullets = [];
        invaderBullets = [];
        sound.play('powerup');
    }
}

// Draw
function drawPlayer() {
    ctx.fillStyle = '#0f0';
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Turret
    ctx.fillRect(player.x + 12, player.y - 6, 6, 6);
}

function drawInvader(inv) {
    if (!inv.alive) return;

    const frame = Math.floor(inv.frame);

    if (inv.type === 'octopus') {
        // Top row - octopus (30 points) - Purple/Magenta
        ctx.fillStyle = '#f0f';

        // Body
        ctx.fillRect(inv.x + 8, inv.y, 16, 8);
        ctx.fillRect(inv.x, inv.y + 8, 32, 8);

        // Legs (animated)
        if (frame === 0) {
            ctx.fillRect(inv.x + 4, inv.y + 16, 8, 8);
            ctx.fillRect(inv.x + 20, inv.y + 16, 8, 8);
        } else {
            ctx.fillRect(inv.x, inv.y + 16, 8, 8);
            ctx.fillRect(inv.x + 24, inv.y + 16, 8, 8);
        }

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(inv.x + 8, inv.y + 4, 4, 4);
        ctx.fillRect(inv.x + 20, inv.y + 4, 4, 4);

    } else if (inv.type === 'crab') {
        // Middle rows - crab (20 points) - Cyan
        ctx.fillStyle = '#0ff';

        // Claws (animated)
        if (frame === 0) {
            ctx.fillRect(inv.x + 4, inv.y, 8, 8);
            ctx.fillRect(inv.x + 20, inv.y, 8, 8);
        } else {
            ctx.fillRect(inv.x + 2, inv.y + 4, 8, 8);
            ctx.fillRect(inv.x + 22, inv.y + 4, 8, 8);
        }

        // Body
        ctx.fillRect(inv.x + 8, inv.y + 8, 16, 8);
        ctx.fillRect(inv.x, inv.y + 16, 32, 8);

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(inv.x + 8, inv.y + 12, 4, 4);
        ctx.fillRect(inv.x + 20, inv.y + 12, 4, 4);

    } else {
        // Bottom rows - squid (10 points) - Green
        ctx.fillStyle = '#0f0';

        // Head
        ctx.fillRect(inv.x + 8, inv.y, 16, 8);
        ctx.fillRect(inv.x + 4, inv.y + 8, 24, 8);

        // Tentacles (animated)
        if (frame === 0) {
            ctx.fillRect(inv.x, inv.y + 16, 8, 8);
            ctx.fillRect(inv.x + 12, inv.y + 16, 8, 8);
            ctx.fillRect(inv.x + 24, inv.y + 16, 8, 8);
        } else {
            ctx.fillRect(inv.x + 4, inv.y + 16, 8, 8);
            ctx.fillRect(inv.x + 20, inv.y + 16, 8, 8);
        }

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(inv.x + 10, inv.y + 4, 3, 3);
        ctx.fillRect(inv.x + 19, inv.y + 4, 3, 3);
    }
}

function drawBullet(bullet, color = '#fff') {
    ctx.fillStyle = color;
    ctx.fillRect(bullet.x - bullet.width / 2, bullet.y, bullet.width, bullet.height);
}

function drawBunker(bunker) {
    if (bunker.health <= 0) return;

    const alpha = bunker.health / 3;
    ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
    ctx.fillRect(bunker.x, bunker.y, bunker.width, bunker.height);
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawPlayer();

    invaders.forEach(inv => drawInvader(inv));

    bullets.forEach(b => drawBullet(b, '#fff'));
    invaderBullets.forEach(b => drawBullet(b, '#f00'));

    bunkers.forEach(b => drawBunker(b));

    if (gameOver) {
        ctx.fillStyle = '#fff';
        ctx.font = '40px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        ctx.font = '16px "Courier New"';
        ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 40);
    }
}

// Game loop
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// Restart
window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && gameOver) {
        gameOver = false;
        score = 0;
        lives = 3;
        level = 1;
        player.x = 350;
        bullets = [];
        invaderBullets = [];
        scoreEl.textContent = `Score: ${score}`;
        livesEl.textContent = `Lives: ${lives}`;
        levelEl.textContent = `Level: ${level}`;
        invaderDirection = 1;
        spawnInvaders();
        spawnBunkers();
    }
});

init();
