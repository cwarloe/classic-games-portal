const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const statusEl = document.getElementById('connectionStatus');

// Game state
const keys = {};
let player = { x: 300, y: 650, width: 20, height: 20, speed: 5 };
let enemies = [];
let bullets = [];
let enemyBullets = [];
let score = 0;
let lives = 3;
let level = 1;
let gameOver = false;
let enemyFormation = { x: 50, y: 100, direction: 1, speed: 1 };
let fireTimer = 0;
let enemyFireTimer = 0;

// Multiplayer state
let twoPlayerMode = false;
let currentPlayer = 1;
let player1Score = 0;
let player2Score = 0;
let player1Lives = 3;
let player2Lives = 3;
let showTurnMessage = false;
let turnMessageTimer = 0;

// Constants
const ENEMY_COLORS = {
    'bee': '#ff0',
    'butterfly': '#f00',
    'boss': '#0ff'
};

// Initialize game
function init() {
    updateStatusDisplay();
    spawnEnemies();
    gameLoop();
}

function updateStatusDisplay() {
    if (twoPlayerMode) {
        statusEl.textContent = `P1: ${player1Score} | P2: ${player2Score} | Current: P${currentPlayer}`;
    } else {
        statusEl.textContent = 'Press T for 2-Player Mode';
    }
    statusEl.classList.remove('disconnected');
}

// Spawn enemy formation
function spawnEnemies() {
    enemies = [];
    const rows = 4 + Math.floor(level / 3);
    const cols = 8;
    const spacing = 50;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let type = 'bee';
            let points = 50;
            if (row < 1) { type = 'boss'; points = 150; }
            else if (row < 3) { type = 'butterfly'; points = 100; }

            enemies.push({
                x: col * spacing,
                y: row * spacing,
                formationX: col * spacing,
                formationY: row * spacing,
                width: 20,
                height: 20,
                type: type,
                points: points,
                diving: false,
                diveTimer: 0,
                diveX: 0,
                diveY: 0
            });
        }
    }

    enemyFormation = { x: 50, y: 100, direction: 1, speed: 1 + level * 0.3 };
}

// Input handling
window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        keys[e.key] = true;
    }

    // Toggle 2-player mode
    if ((e.key === 't' || e.key === 'T') && !gameOver) {
        twoPlayerMode = !twoPlayerMode;
        if (twoPlayerMode) {
            currentPlayer = 1;
            player1Score = score;
            player2Score = 0;
            player1Lives = lives;
            player2Lives = 3;
        }
        updateStatusDisplay();
    }

    // Continue after turn transition
    if (e.key === ' ' && showTurnMessage) {
        showTurnMessage = false;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Update game state
function update() {
    if (gameOver) return;

    // Turn message timer
    if (showTurnMessage) {
        turnMessageTimer--;
        if (turnMessageTimer <= 0) {
            showTurnMessage = false;
        }
        return; // Pause game during turn message
    }

    // Update player
    if (keys['ArrowLeft'] && player.x > 10) player.x -= player.speed;
    if (keys['ArrowRight'] && player.x < canvas.width - 30) player.x += player.speed;

    // Player shooting
    fireTimer = Math.max(0, fireTimer - 1);
    if (keys[' '] && fireTimer === 0) {
        bullets.push({ x: player.x + 10, y: player.y, speed: 8 });
        fireTimer = 15;
        sound.play('shoot');
    }

    // Update bullets
    bullets = bullets.filter(b => {
        b.y -= b.speed;
        return b.y > 0;
    });

    // Update enemy bullets
    enemyBullets = enemyBullets.filter(b => {
        b.y += b.speed;
        return b.y < canvas.height;
    });

    // Update enemy formation
    enemyFormation.x += enemyFormation.direction * enemyFormation.speed;
    if (enemyFormation.x > 100 || enemyFormation.x < 0) {
        enemyFormation.direction *= -1;
        enemyFormation.y += 10;
    }

    // Update enemies
    enemies.forEach((enemy, idx) => {
        if (enemy.diving) {
            enemy.diveTimer--;
            const progress = 1 - (enemy.diveTimer / 180);
            if (progress < 0.5) {
                // Dive down
                enemy.x = enemy.formationX + enemyFormation.x + Math.sin(progress * Math.PI * 4) * 100;
                enemy.y = enemy.formationY + enemyFormation.y + progress * 600;
            } else {
                // Return to formation
                enemy.x = enemy.diveX + (enemy.formationX + enemyFormation.x - enemy.diveX) * (progress - 0.5) * 2;
                enemy.y = enemy.diveY + (enemy.formationY + enemyFormation.y - enemy.diveY) * (progress - 0.5) * 2;
            }

            if (enemy.diveTimer <= 0) {
                enemy.diving = false;
                enemy.x = enemy.formationX + enemyFormation.x;
                enemy.y = enemy.formationY + enemyFormation.y;
            }

            // Enemy shoots while diving
            if (Math.random() < 0.02) {
                enemyBullets.push({ x: enemy.x, y: enemy.y + 10, speed: 4 });
            }
        } else {
            enemy.x = enemy.formationX + enemyFormation.x;
            enemy.y = enemy.formationY + enemyFormation.y;

            // Random dive
            if (Math.random() < 0.001 * (1 + level * 0.1)) {
                enemy.diving = true;
                enemy.diveTimer = 180;
                enemy.diveX = enemy.x;
                enemy.diveY = enemy.y;
            }
        }
    });

    // Random enemy shooting
    enemyFireTimer--;
    if (enemyFireTimer <= 0) {
        const shooters = enemies.filter(e => !e.diving);
        if (shooters.length > 0) {
            const shooter = shooters[Math.floor(Math.random() * shooters.length)];
            enemyBullets.push({ x: shooter.x, y: shooter.y + 10, speed: 3 + level * 0.2 });
        }
        enemyFireTimer = 60 - level * 2;
    }

    // Collision: bullets vs enemies
    bullets.forEach((bullet, bIdx) => {
        enemies.forEach((enemy, eIdx) => {
            if (bullet.x > enemy.x - 10 && bullet.x < enemy.x + 30 &&
                bullet.y > enemy.y - 10 && bullet.y < enemy.y + 30) {
                bullets.splice(bIdx, 1);
                enemies.splice(eIdx, 1);
                score += enemy.points;
                if (twoPlayerMode) {
                    if (currentPlayer === 1) player1Score = score;
                    else player2Score = score;
                    updateStatusDisplay();
                }
                scoreEl.textContent = `Score: ${score}`;
                sound.play('explosion');
            }
        });
    });

    // Collision: enemy bullets vs player
    enemyBullets.forEach((bullet, idx) => {
        if (bullet.x > player.x - 5 && bullet.x < player.x + 25 &&
            bullet.y > player.y - 5 && bullet.y < player.y + 25) {
            enemyBullets.splice(idx, 1);
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            sound.play('hit');

            if (twoPlayerMode) {
                // Update current player's stats
                if (currentPlayer === 1) {
                    player1Lives = lives;
                    player1Score = score;
                } else {
                    player2Lives = lives;
                    player2Score = score;
                }

                // Check if current player is out
                if (lives <= 0) {
                    // Switch to other player
                    currentPlayer = currentPlayer === 1 ? 2 : 1;

                    // Load other player's stats
                    if (currentPlayer === 1) {
                        score = player1Score;
                        lives = player1Lives;
                    } else {
                        score = player2Score;
                        lives = player2Lives;
                    }

                    // Check if both players are out
                    if (player1Lives <= 0 && player2Lives <= 0) {
                        gameOver = true;
                        const winner = player1Score > player2Score ? 1 : (player2Score > player1Score ? 2 : 0);
                        statusEl.textContent = winner === 0 ? 'TIE GAME!' : `PLAYER ${winner} WINS!`;
                        statusEl.classList.add('disconnected');
                        sound.play('death');
                    } else {
                        // Show turn message
                        showTurnMessage = true;
                        turnMessageTimer = 180;
                        updateStatusDisplay();
                    }

                    scoreEl.textContent = `Score: ${score}`;
                    livesEl.textContent = `Lives: ${lives}`;
                }
            } else {
                if (lives <= 0) {
                    gameOver = true;
                    statusEl.textContent = 'GAME OVER - Press R to restart';
                    statusEl.classList.add('disconnected');
                    sound.play('death');
                }
            }
        }
    });

    // Check wave complete
    if (enemies.length === 0) {
        level++;
        levelEl.textContent = `Wave: ${level}`;
        setTimeout(() => spawnEnemies(), 1000);
    }
}

// Drawing functions
function drawShip(x, y, color) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(0, 20);
    ctx.lineTo(20, 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(0, 16, 4, 6);
    ctx.fillRect(16, 16, 4, 6);

    ctx.restore();
}

function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    const color = ENEMY_COLORS[enemy.type] || '#fff';

    if (enemy.type === 'bee') {
        ctx.fillStyle = color;
        ctx.fillRect(-8, -8, 16, 16);
        ctx.fillStyle = '#000';
        ctx.fillRect(-4, -4, 3, 3);
        ctx.fillRect(2, -4, 3, 3);
    } else if (enemy.type === 'butterfly') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(-8, 0, 6, 0, Math.PI * 2);
        ctx.arc(8, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-4, -6, 8, 12);
    } else if (enemy.type === 'boss') {
        ctx.fillStyle = color;
        ctx.fillRect(-12, -12, 24, 24);
        ctx.fillStyle = '#000';
        ctx.fillRect(-8, -6, 4, 4);
        ctx.fillRect(4, -6, 4, 4);
        ctx.fillStyle = color;
        ctx.fillRect(-16, -4, 4, 8);
        ctx.fillRect(12, -4, 4, 8);
    }

    ctx.restore();
}

function drawBullet(bullet, isEnemy = false) {
    ctx.fillStyle = isEnemy ? '#f00' : '#0f0';
    ctx.fillRect(bullet.x - 2, bullet.y - 6, 4, 12);
}

function drawStars() {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 50; i++) {
        const x = (i * 123) % canvas.width;
        const y = (i * 456 + Date.now() * 0.05) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
    }
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawStars();

    enemyBullets.forEach(bullet => drawBullet(bullet, true));
    bullets.forEach(bullet => drawBullet(bullet, false));
    enemies.forEach(enemy => drawEnemy(enemy));

    if (!gameOver) {
        drawShip(player.x, player.y, '#0f0');
    }

    if (gameOver) {
        ctx.fillStyle = '#fff';
        ctx.font = '30px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        ctx.font = '16px "Courier New"';
        if (twoPlayerMode) {
            const winner = player1Score > player2Score ? 1 : (player2Score > player1Score ? 2 : 0);
            ctx.fillText(winner === 0 ? 'TIE GAME!' : `PLAYER ${winner} WINS!`, canvas.width / 2, canvas.height / 2 + 40);
            ctx.fillText(`P1: ${player1Score}  |  P2: ${player2Score}`, canvas.width / 2, canvas.height / 2 + 65);
        } else {
            ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 40);
        }
    }

    if (showTurnMessage) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0';
        ctx.font = '40px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText(`PLAYER ${currentPlayer}'S TURN`, canvas.width / 2, canvas.height / 2);
        ctx.font = '16px "Courier New"';
        ctx.fillStyle = '#fff';
        ctx.fillText('Press SPACE to continue', canvas.width / 2, canvas.height / 2 + 40);
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
            twoPlayerMode = false;
            currentPlayer = 1;
            player1Score = 0;
            player2Score = 0;
            player1Lives = 3;
            player2Lives = 3;
            score = 0;
            lives = 3;
            level = 1;
            player.x = 300;
            bullets = [];
            enemyBullets = [];
            scoreEl.textContent = `Score: ${score}`;
            livesEl.textContent = `Lives: ${lives}`;
            levelEl.textContent = `Wave: ${level}`;
            updateStatusDisplay();
            spawnEnemies();
        }
    }
});

// Start the game
init();
