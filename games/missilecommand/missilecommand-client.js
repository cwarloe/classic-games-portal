const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const waveEl = document.getElementById('wave');
const ammoEl = document.getElementById('ammo');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const wavesCompletedEl = document.getElementById('wavesCompleted');

// Game constants
const GROUND_Y = 560;
const BATTERY_POSITIONS = [
    { x: 100, y: GROUND_Y },  // Left
    { x: 400, y: GROUND_Y },  // Center
    { x: 700, y: GROUND_Y }   // Right
];
const CITY_POSITIONS = [
    { x: 180, y: GROUND_Y - 20, alive: true },
    { x: 260, y: GROUND_Y - 20, alive: true },
    { x: 340, y: GROUND_Y - 20, alive: true },
    { x: 460, y: GROUND_Y - 20, alive: true },
    { x: 540, y: GROUND_Y - 20, alive: true },
    { x: 620, y: GROUND_Y - 20, alive: true }
];
const EXPLOSION_RADIUS_MAX = 60;
const EXPLOSION_GROWTH_RATE = 3;
const EXPLOSION_SHRINK_RATE = 2;
const MISSILE_SPEED = 2;

// Game state
let score = 0;
let wave = 1;
let gameOver = false;
let batteries = [
    { x: BATTERY_POSITIONS[0].x, y: BATTERY_POSITIONS[0].y, ammo: 10, maxAmmo: 10 },
    { x: BATTERY_POSITIONS[1].x, y: BATTERY_POSITIONS[1].y, ammo: 10, maxAmmo: 10 },
    { x: BATTERY_POSITIONS[2].x, y: BATTERY_POSITIONS[2].y, ammo: 10, maxAmmo: 10 }
];
let cities = [...CITY_POSITIONS];
let enemyMissiles = [];
let playerMissiles = [];
let explosions = [];
let waveActive = false;
let waveCompleteTimer = 0;
let crosshair = { x: 400, y: 300 };

// Input
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    handleKeyPress(e.key.toLowerCase());
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    crosshair.x = e.clientX - rect.left;
    crosshair.y = e.clientY - rect.top;
});

canvas.addEventListener('click', (e) => {
    if (gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const targetX = e.clientX - rect.left;
    const targetY = e.clientY - rect.top;
    fireFromNearestBattery(targetX, targetY);
});

function handleKeyPress(key) {
    if (gameOver) return;

    const targetX = crosshair.x;
    const targetY = crosshair.y;

    switch(key) {
        case 'q':
        case 'a':
            fireMissile(0, targetX, targetY);
            break;
        case 'w':
        case 's':
            fireMissile(1, targetX, targetY);
            break;
        case 'e':
        case 'd':
            fireMissile(2, targetX, targetY);
            break;
    }
}

function fireFromNearestBattery(targetX, targetY) {
    // Find nearest battery with ammo
    let nearestBattery = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < batteries.length; i++) {
        if (batteries[i].ammo > 0) {
            const dist = Math.hypot(batteries[i].x - targetX, batteries[i].y - targetY);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestBattery = i;
            }
        }
    }

    if (nearestBattery !== -1) {
        fireMissile(nearestBattery, targetX, targetY);
    }
}

function fireMissile(batteryIndex, targetX, targetY) {
    const battery = batteries[batteryIndex];

    if (battery.ammo <= 0) return;

    battery.ammo--;

    playerMissiles.push({
        startX: battery.x,
        startY: battery.y,
        x: battery.x,
        y: battery.y,
        targetX: targetX,
        targetY: targetY,
        speed: 8,
        trail: []
    });

    sound.play('shoot');
    updateUI();
}

function spawnWave() {
    waveActive = true;
    const missileCount = 5 + wave * 2;
    const speed = 1 + wave * 0.2;

    for (let i = 0; i < missileCount; i++) {
        setTimeout(() => {
            spawnEnemyMissile(speed);
        }, i * 500);
    }
}

function spawnEnemyMissile(speed) {
    const startX = Math.random() * canvas.width;

    // Target random city or battery
    let targetX, targetY;
    const targetType = Math.random();

    if (targetType < 0.7) {
        // Target cities
        const aliveCities = cities.filter(c => c.alive);
        if (aliveCities.length > 0) {
            const city = aliveCities[Math.floor(Math.random() * aliveCities.length)];
            targetX = city.x;
            targetY = city.y;
        } else {
            targetX = BATTERY_POSITIONS[Math.floor(Math.random() * 3)].x;
            targetY = GROUND_Y;
        }
    } else {
        // Target batteries
        const batteryIndex = Math.floor(Math.random() * 3);
        targetX = BATTERY_POSITIONS[batteryIndex].x;
        targetY = GROUND_Y;
    }

    enemyMissiles.push({
        startX: startX,
        startY: 0,
        x: startX,
        y: 0,
        targetX: targetX,
        targetY: targetY,
        speed: speed,
        trail: []
    });
}

function update() {
    if (gameOver) return;

    // Update player missiles
    for (let i = playerMissiles.length - 1; i >= 0; i--) {
        const m = playerMissiles[i];

        // Add to trail
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 15) m.trail.shift();

        // Move toward target
        const dx = m.targetX - m.x;
        const dy = m.targetY - m.y;
        const dist = Math.hypot(dx, dy);

        if (dist < m.speed) {
            // Reached target - explode
            createExplosion(m.targetX, m.targetY, '#0ff', true);
            playerMissiles.splice(i, 1);
            sound.play('explosion');
        } else {
            m.x += (dx / dist) * m.speed;
            m.y += (dy / dist) * m.speed;
        }
    }

    // Update enemy missiles
    for (let i = enemyMissiles.length - 1; i >= 0; i--) {
        const m = enemyMissiles[i];

        // Add to trail
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 20) m.trail.shift();

        // Move toward target
        const dx = m.targetX - m.x;
        const dy = m.targetY - m.y;
        const dist = Math.hypot(dx, dy);

        if (dist < m.speed) {
            // Hit target
            handleEnemyMissileHit(m.targetX, m.targetY);
            enemyMissiles.splice(i, 1);
            continue; // Skip collision check for removed missile
        } else {
            m.x += (dx / dist) * m.speed;
            m.y += (dy / dist) * m.speed;
        }

        // Check collision with explosions
        let hitExplosion = false;
        for (const exp of explosions) {
            if (exp.playerExplosion && exp.growing) {
                const expDist = Math.hypot(m.x - exp.x, m.y - exp.y);
                if (expDist < exp.radius) {
                    createExplosion(m.x, m.y, '#ff0', false);
                    enemyMissiles.splice(i, 1);
                    score += 25 * wave;
                    sound.play('hit');
                    updateUI();
                    hitExplosion = true;
                    break;
                }
            }
        }
    }

    // Update explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];

        if (exp.growing) {
            exp.radius += EXPLOSION_GROWTH_RATE;
            if (exp.radius >= exp.maxRadius) {
                exp.growing = false;
            }
        } else {
            exp.radius -= EXPLOSION_SHRINK_RATE;
            if (exp.radius <= 0) {
                explosions.splice(i, 1);
            }
        }
    }

    // Check wave completion
    if (waveActive && enemyMissiles.length === 0 && playerMissiles.length === 0) {
        waveCompleteTimer++;
        if (waveCompleteTimer > 60) {
            completeWave();
        }
    }

    // Check game over
    if (cities.every(c => !c.alive)) {
        endGame();
    }
}

function handleEnemyMissileHit(x, y) {
    createExplosion(x, y, '#f00', false);
    sound.play('explosion');

    // Check if city was hit
    for (const city of cities) {
        if (city.alive && Math.hypot(city.x - x, city.y - y) < 30) {
            city.alive = false;
            sound.play('death');
        }
    }
}

function createExplosion(x, y, color, playerExplosion) {
    explosions.push({
        x: x,
        y: y,
        radius: 0,
        maxRadius: playerExplosion ? EXPLOSION_RADIUS_MAX : 40,
        color: color,
        growing: true,
        playerExplosion: playerExplosion
    });
}

function completeWave() {
    waveCompleteTimer = 0;

    // Bonus points for surviving cities
    const aliveCityCount = cities.filter(c => c.alive).length;
    const cityBonus = aliveCityCount * 100 * wave;
    score += cityBonus;

    // Bonus points for remaining ammo
    const totalAmmo = batteries.reduce((sum, b) => sum + b.ammo, 0);
    const ammoBonus = totalAmmo * 5 * wave;
    score += ammoBonus;

    // Refill ammo
    batteries.forEach(b => b.ammo = b.maxAmmo);

    sound.play('powerup');
    wave++;
    waveActive = false;
    updateUI();

    setTimeout(() => {
        spawnWave();
    }, 2000);
}

function endGame() {
    gameOver = true;
    finalScoreEl.textContent = `Final Score: ${score}`;
    wavesCompletedEl.textContent = `Waves Completed: ${wave - 1}`;
    gameOverScreen.classList.add('show');
    sound.play('death');
}

function draw() {
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, GROUND_Y, canvas.width, 40);

    // Draw cities
    cities.forEach(city => {
        if (city.alive) {
            // Draw buildings
            ctx.fillStyle = '#0ff';
            ctx.fillRect(city.x - 15, city.y - 15, 10, 15);
            ctx.fillRect(city.x - 2, city.y - 20, 8, 20);
            ctx.fillRect(city.x + 8, city.y - 12, 10, 12);
        } else {
            // Draw rubble
            ctx.fillStyle = '#555';
            ctx.fillRect(city.x - 15, city.y - 5, 30, 5);
        }
    });

    // Draw batteries
    batteries.forEach((battery, i) => {
        ctx.fillStyle = battery.ammo > 0 ? '#0f0' : '#333';
        ctx.beginPath();
        ctx.moveTo(battery.x - 15, battery.y);
        ctx.lineTo(battery.x + 15, battery.y);
        ctx.lineTo(battery.x, battery.y - 20);
        ctx.closePath();
        ctx.fill();

        // Draw ammo indicator
        if (battery.ammo > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(battery.ammo, battery.x, battery.y - 5);
        }
    });

    // Draw enemy missiles
    enemyMissiles.forEach(m => {
        // Trail
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        m.trail.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Missile head
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw player missiles
    playerMissiles.forEach(m => {
        // Trail
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        m.trail.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Missile head
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw explosions
    explosions.forEach(exp => {
        const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
        gradient.addColorStop(0, exp.color);
        gradient.addColorStop(0.5, exp.color + '88');
        gradient.addColorStop(1, exp.color + '00');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw explosion ring
        ctx.strokeStyle = exp.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.stroke();
    });

    // Draw crosshair
    if (!gameOver) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(crosshair.x - 10, crosshair.y);
        ctx.lineTo(crosshair.x + 10, crosshair.y);
        ctx.moveTo(crosshair.x, crosshair.y - 10);
        ctx.lineTo(crosshair.x, crosshair.y + 10);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(crosshair.x, crosshair.y, 15, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function updateUI() {
    scoreEl.textContent = `Score: ${score}`;
    waveEl.textContent = `Wave: ${wave}`;
    ammoEl.textContent = `Left: ${batteries[0].ammo} | Center: ${batteries[1].ammo} | Right: ${batteries[2].ammo}`;
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Initialize
updateUI();
spawnWave();
gameLoop();
