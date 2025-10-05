const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const timeEl = document.getElementById('time');

// Game state
const keys = {};
let frog = { x: 260, y: 600, width: 30, height: 30, onLog: null };
let cars = [];
let logs = [];
let turtles = [];
let homes = [];
let score = 0;
let lives = 3;
let timeLeft = 60;
let gameOver = false;
let levelComplete = false;
let moveTimer = 0;

// Constants
const TILE_SIZE = 40;
const GRID_WIDTH = 13;
const GRID_HEIGHT = 15;

// Initialize
function init() {
    spawnLanes();
    spawnHomes();
    startTimer();
    gameLoop();
}

// Spawn homes (safe zones at top)
function spawnHomes() {
    homes = [];
    for (let i = 0; i < 5; i++) {
        homes.push({
            x: 20 + i * 100,
            y: 20,
            width: 40,
            height: 40,
            filled: false
        });
    }
}

// Spawn traffic and water obstacles
function spawnLanes() {
    cars = [];
    logs = [];
    turtles = [];

    // Road lanes (cars)
    const carLanes = [
        { y: 500, speed: 2, direction: 1, count: 3, width: 60 },
        { y: 460, speed: -3, direction: -1, count: 2, width: 80 },
        { y: 420, speed: 1.5, direction: 1, count: 4, width: 50 },
        { y: 380, speed: -2.5, direction: -1, count: 3, width: 70 },
        { y: 340, speed: 2.5, direction: 1, count: 2, width: 90 }
    ];

    carLanes.forEach(lane => {
        const spacing = canvas.width / lane.count;
        for (let i = 0; i < lane.count; i++) {
            cars.push({
                x: i * spacing,
                y: lane.y,
                width: lane.width,
                height: 30,
                speed: lane.speed,
                color: ['#f00', '#00f', '#ff0', '#f0f'][Math.floor(Math.random() * 4)]
            });
        }
    });

    // River lanes (logs and turtles)
    const waterLanes = [
        { y: 260, speed: 2, type: 'log', count: 2, width: 120 },
        { y: 220, speed: -1.5, type: 'turtle', count: 3, width: 80 },
        { y: 180, speed: 2.5, type: 'log', count: 2, width: 150 },
        { y: 140, speed: -2, type: 'turtle', count: 3, width: 90 },
        { y: 100, speed: 1.8, type: 'log', count: 3, width: 100 }
    ];

    waterLanes.forEach(lane => {
        const spacing = canvas.width / lane.count;
        for (let i = 0; i < lane.count; i++) {
            const obj = {
                x: i * spacing,
                y: lane.y,
                width: lane.width,
                height: 30,
                speed: lane.speed
            };

            if (lane.type === 'log') {
                logs.push(obj);
            } else {
                turtles.push({ ...obj, submerged: false, submergeTimer: 0 });
            }
        }
    });
}

// Timer
function startTimer() {
    setInterval(() => {
        if (!gameOver && !levelComplete) {
            timeLeft--;
            timeEl.textContent = `Time: ${timeLeft}`;
            if (timeLeft <= 0) {
                lives--;
                livesEl.textContent = `Lives: ${lives}`;
                sound.play('hit');
                resetFrog();
                if (lives <= 0) {
                    gameOver = true;
                    sound.play('death');
                }
            }
        }
    }, 1000);
}

// Input
window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();

        if (moveTimer > 0) return;

        const oldX = frog.x;
        const oldY = frog.y;

        if (e.key === 'ArrowUp') frog.y -= TILE_SIZE;
        if (e.key === 'ArrowDown') frog.y += TILE_SIZE;
        if (e.key === 'ArrowLeft') frog.x -= TILE_SIZE;
        if (e.key === 'ArrowRight') frog.x += TILE_SIZE;

        // Bounds
        frog.x = Math.max(0, Math.min(canvas.width - frog.width, frog.x));
        frog.y = Math.max(0, Math.min(canvas.height - frog.height, frog.y));

        if (oldX !== frog.x || oldY !== frog.y) {
            sound.play('jump');
            moveTimer = 10;

            // Score for forward movement
            if (frog.y < oldY) {
                score += 10;
                scoreEl.textContent = `Score: ${score}`;
            }
        }
    }
});

// Update
function update() {
    if (gameOver || levelComplete) return;

    moveTimer = Math.max(0, moveTimer - 1);

    // Update cars
    cars.forEach(car => {
        car.x += car.speed;
        if (car.speed > 0 && car.x > canvas.width) car.x = -car.width;
        if (car.speed < 0 && car.x < -car.width) car.x = canvas.width;
    });

    // Update logs
    logs.forEach(log => {
        log.x += log.speed;
        if (log.speed > 0 && log.x > canvas.width) log.x = -log.width;
        if (log.speed < 0 && log.x < -log.width) log.x = canvas.width;
    });

    // Update turtles
    turtles.forEach(turtle => {
        turtle.x += turtle.speed;
        if (turtle.speed > 0 && turtle.x > canvas.width) turtle.x = -turtle.width;
        if (turtle.speed < 0 && turtle.x < -turtle.width) turtle.x = canvas.width;

        // Submerge animation
        turtle.submergeTimer++;
        if (turtle.submergeTimer > 180) {
            turtle.submerged = true;
        }
        if (turtle.submergeTimer > 240) {
            turtle.submerged = false;
            turtle.submergeTimer = 0;
        }
    });

    // Check if on log/turtle
    frog.onLog = null;
    const inWater = frog.y >= 100 && frog.y <= 260;

    if (inWater) {
        let onSomething = false;

        logs.forEach(log => {
            if (frog.x + frog.width > log.x && frog.x < log.x + log.width &&
                Math.abs(frog.y - log.y) < 30) {
                frog.onLog = log;
                onSomething = true;
            }
        });

        turtles.forEach(turtle => {
            if (!turtle.submerged && frog.x + frog.width > turtle.x && frog.x < turtle.x + turtle.width &&
                Math.abs(frog.y - turtle.y) < 30) {
                frog.onLog = turtle;
                onSomething = true;
            }
        });

        if (!onSomething) {
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            sound.play('hit');
            resetFrog();
            if (lives <= 0) {
                gameOver = true;
                sound.play('death');
            }
        }
    }

    // Move with log/turtle
    if (frog.onLog) {
        frog.x += frog.onLog.speed;

        // Check if frog went off screen
        if (frog.x < 0 || frog.x > canvas.width) {
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            sound.play('hit');
            resetFrog();
            if (lives <= 0) {
                gameOver = true;
                sound.play('death');
            }
        }
    }

    // Collision with cars
    const onRoad = frog.y >= 340 && frog.y <= 500;
    if (onRoad) {
        cars.forEach(car => {
            if (frog.x + frog.width > car.x && frog.x < car.x + car.width &&
                Math.abs(frog.y - car.y) < 30) {
                lives--;
                livesEl.textContent = `Lives: ${lives}`;
                sound.play('hit');
                resetFrog();
                if (lives <= 0) {
                    gameOver = true;
                    sound.play('death');
                }
            }
        });
    }

    // Check if reached home
    if (frog.y < 60) {
        let foundHome = false;
        homes.forEach(home => {
            if (!home.filled && frog.x + frog.width > home.x && frog.x < home.x + home.width) {
                home.filled = true;
                foundHome = true;
                score += 100 + timeLeft * 2;
                scoreEl.textContent = `Score: ${score}`;
                sound.play('coin');
                resetFrog();

                // Check if all homes filled
                if (homes.every(h => h.filled)) {
                    levelComplete = true;
                    sound.play('powerup');
                }
            }
        });

        if (!foundHome) {
            lives--;
            livesEl.textContent = `Lives: ${lives}`;
            sound.play('hit');
            resetFrog();
            if (lives <= 0) {
                gameOver = true;
                sound.play('death');
            }
        }
    }
}

function resetFrog() {
    frog.x = 260;
    frog.y = 600;
    frog.onLog = null;
    timeLeft = 60;
}

// Draw
function drawFrog() {
    ctx.fillStyle = '#0f0';
    ctx.fillRect(frog.x, frog.y, frog.width, frog.height);

    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(frog.x + 5, frog.y + 5, 8, 8);
    ctx.fillRect(frog.x + 17, frog.y + 5, 8, 8);
}

function drawCar(car) {
    ctx.fillStyle = car.color;
    ctx.fillRect(car.x, car.y, car.width, car.height);

    // Windows
    ctx.fillStyle = '#0ff';
    ctx.fillRect(car.x + 10, car.y + 5, car.width - 20, 10);
}

function drawLog(log) {
    ctx.fillStyle = '#840';
    ctx.fillRect(log.x, log.y, log.width, log.height);

    // Wood texture
    ctx.strokeStyle = '#630';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(log.x + i * (log.width / 3), log.y);
        ctx.lineTo(log.x + i * (log.width / 3), log.y + log.height);
        ctx.stroke();
    }
}

function drawTurtle(turtle) {
    if (turtle.submerged) return;

    ctx.fillStyle = '#080';
    ctx.fillRect(turtle.x, turtle.y, turtle.width, turtle.height);

    // Shells
    ctx.fillStyle = '#0a0';
    const shellCount = Math.floor(turtle.width / 30);
    for (let i = 0; i < shellCount; i++) {
        ctx.beginPath();
        ctx.arc(turtle.x + 15 + i * 30, turtle.y + 15, 12, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawHome(home) {
    if (home.filled) {
        ctx.fillStyle = '#0f0';
        ctx.fillRect(home.x, home.y, home.width, home.height);
        drawFrog({ x: home.x + 5, y: home.y + 5, width: 30, height: 30 });
    } else {
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 3;
        ctx.strokeRect(home.x, home.y, home.width, home.height);
    }
}

function render() {
    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Goal area
    ctx.fillStyle = '#040';
    ctx.fillRect(0, 0, canvas.width, 80);

    // River
    ctx.fillStyle = '#006';
    ctx.fillRect(0, 80, canvas.width, 200);

    // Middle safe zone
    ctx.fillStyle = '#060';
    ctx.fillRect(0, 280, canvas.width, 60);

    // Road
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 340, canvas.width, 180);

    // Bottom safe zone
    ctx.fillStyle = '#060';
    ctx.fillRect(0, 520, canvas.width, 130);

    // Draw entities
    logs.forEach(log => drawLog(log));
    turtles.forEach(turtle => drawTurtle(turtle));
    cars.forEach(car => drawCar(car));
    homes.forEach(home => drawHome(home));
    drawFrog();

    // Game over / level complete
    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '40px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        ctx.font = '16px "Courier New"';
        ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 40);
    }

    if (levelComplete) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = '40px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL COMPLETE!', canvas.width / 2, canvas.height / 2);
        ctx.font = '16px "Courier New"';
        ctx.fillText('Press R to continue', canvas.width / 2, canvas.height / 2 + 40);
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
    if ((e.key === 'r' || e.key === 'R') && (gameOver || levelComplete)) {
        if (levelComplete) {
            score += 1000;
            levelComplete = false;
        } else {
            score = 0;
            lives = 3;
        }

        gameOver = false;
        timeLeft = 60;
        resetFrog();
        spawnLanes();
        spawnHomes();
        scoreEl.textContent = `Score: ${score}`;
        livesEl.textContent = `Lives: ${lives}`;
        timeEl.textContent = `Time: ${timeLeft}`;
    }
});

init();
