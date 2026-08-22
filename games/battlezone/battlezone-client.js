// Battlezone - Classic Vector Graphics Tank Game
// Authentic 1980 Atari arcade experience

class Battlezone {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.radarCanvas = document.getElementById('radar');
        this.radarCtx = this.radarCanvas.getContext('2d');

        // Set radar size
        this.radarCanvas.width = 120;
        this.radarCanvas.height = 120;

        // Game state
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.gameOver = false;
        this.paused = false;

        // Player tank
        this.player = {
            x: 0,
            z: 0,
            angle: 0,
            speed: 0,
            rotationSpeed: 0,
            maxSpeed: 0.08,
            acceleration: 0.004,
            friction: 0.95,
            rotationAccel: 0.002,
            rotationFriction: 0.90
        };

        // Bullets
        this.bullets = [];
        this.bulletSpeed = 0.5;
        this.bulletLifetime = 2000; // ms
        this.lastShootTime = 0;
        this.shootCooldown = 400; // ms

        // Enemies
        this.enemies = [];
        this.enemyBullets = [];
        this.maxEnemies = 3;
        this.enemySpawnDelay = 3000; // ms
        this.lastEnemySpawn = 0;

        // Mountains (background obstacles)
        this.mountains = [];
        this.generateMountains();

        // Input
        this.keys = {};

        // Kill tracking for level progression
        this.killCount = 0;
        this.killsPerLevel = 10;

        // Setup
        this.setupInput();
        this.setupUI();

        // Start game
        this.lastTime = performance.now();
        this.gameLoop();
        setTimeout(() => this.showLevelMessage('LEVEL 1'), 500);
    }

    generateMountains() {
        // Generate random mountains in the distance
        const mountainCount = 15;
        for (let i = 0; i < mountainCount; i++) {
            const angle = (Math.PI * 2 * i) / mountainCount + Math.random() * 0.3;
            const distance = 80 + Math.random() * 40;
            this.mountains.push({
                x: Math.cos(angle) * distance,
                z: Math.sin(angle) * distance,
                width: 15 + Math.random() * 25,
                height: 10 + Math.random() * 20
            });
        }
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;

            // Shoot
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                this.shoot();
            }

            // Pause
            if (e.key === 'Escape') {
                this.paused = !this.paused;
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    setupUI() {
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restart();
        });
    }

    restart() {
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.gameOver = false;
        this.paused = false;

        this.player.x = 0;
        this.player.z = 0;
        this.player.angle = 0;
        this.player.speed = 0;
        this.player.rotationSpeed = 0;

        this.bullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.killCount = 0;

        document.getElementById('gameOver').style.display = 'none';

        this.showLevelMessage('LEVEL 1');
    }

    showLevelMessage(text) {
        const msg = document.getElementById('levelMessage');
        msg.textContent = text;
        msg.style.display = 'block';

        setTimeout(() => {
            msg.style.display = 'none';
        }, 2000);
    }

    shoot() {
        if (this.gameOver || this.paused) return;

        const now = performance.now();
        if (now - this.lastShootTime < this.shootCooldown) return;

        this.lastShootTime = now;

        // Create bullet in front of tank
        this.bullets.push({
            x: this.player.x + Math.sin(this.player.angle) * 2,
            z: this.player.z + Math.cos(this.player.angle) * 2,
            vx: Math.sin(this.player.angle) * this.bulletSpeed,
            vz: Math.cos(this.player.angle) * this.bulletSpeed,
            createdAt: now
        });

        sound.play('shoot');
    }

    spawnEnemy() {
        const now = performance.now();
        if (this.enemies.length >= this.maxEnemies + this.level - 1) return;
        if (now - this.lastEnemySpawn < this.enemySpawnDelay) return;

        this.lastEnemySpawn = now;

        // Spawn enemy at random distance and angle
        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * 30;

        this.enemies.push({
            x: Math.cos(angle) * distance,
            z: Math.sin(angle) * distance,
            angle: angle + Math.PI, // Face towards center
            health: 2,
            speed: 0.03 + this.level * 0.01,
            lastShot: 0,
            shootCooldown: 2000 + Math.random() * 2000,
            state: 'hunt' // hunt, strafe, shoot
        });
    }

    update(deltaTime) {
        if (this.gameOver || this.paused) return;

        const dt = Math.min(deltaTime, 50); // Cap deltaTime to prevent physics issues

        // Update player
        this.updatePlayer(dt);

        // Update bullets
        this.updateBullets(dt);

        // Update enemies
        this.updateEnemies(dt);

        // Spawn new enemies
        this.spawnEnemy();

        // Check collisions
        this.checkCollisions();

        // Level progression handled by kill count in checkCollisions
    }

    updatePlayer(dt) {
        // Rotation
        if (this.keys['ArrowLeft']) {
            this.player.rotationSpeed -= this.player.rotationAccel * dt;
        }
        if (this.keys['ArrowRight']) {
            this.player.rotationSpeed += this.player.rotationAccel * dt;
        }

        this.player.rotationSpeed *= this.player.rotationFriction;
        this.player.angle += this.player.rotationSpeed * dt;

        // Movement
        if (this.keys['ArrowUp']) {
            this.player.speed += this.player.acceleration * dt;
        }
        if (this.keys['ArrowDown']) {
            this.player.speed -= this.player.acceleration * dt;
        }

        this.player.speed = Math.max(-this.player.maxSpeed, Math.min(this.player.maxSpeed, this.player.speed));
        this.player.speed *= this.player.friction;

        // Apply movement
        this.player.x += Math.sin(this.player.angle) * this.player.speed * dt;
        this.player.z += Math.cos(this.player.angle) * this.player.speed * dt;

        // Keep player in bounds (arena boundary)
        const maxDist = 100;
        const dist = Math.sqrt(this.player.x * this.player.x + this.player.z * this.player.z);
        if (dist > maxDist) {
            this.player.x = (this.player.x / dist) * maxDist;
            this.player.z = (this.player.z / dist) * maxDist;
            this.player.speed *= -0.5; // Bounce back
        }
    }

    updateBullets(dt) {
        const now = performance.now();

        // Update player bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];

            bullet.x += bullet.vx * dt;
            bullet.z += bullet.vz * dt;

            // Remove old bullets
            if (now - bullet.createdAt > this.bulletLifetime) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Remove bullets out of bounds
            const dist = Math.sqrt(bullet.x * bullet.x + bullet.z * bullet.z);
            if (dist > 120) {
                this.bullets.splice(i, 1);
            }
        }

        // Update enemy bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];

            bullet.x += bullet.vx * dt;
            bullet.z += bullet.vz * dt;

            if (now - bullet.createdAt > this.bulletLifetime) {
                this.enemyBullets.splice(i, 1);
                continue;
            }

            const dist = Math.sqrt(bullet.x * bullet.x + bullet.z * bullet.z);
            if (dist > 120) {
                this.enemyBullets.splice(i, 1);
            }
        }
    }

    updateEnemies(dt) {
        const now = performance.now();

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            // AI behavior
            const dx = this.player.x - enemy.x;
            const dz = this.player.z - enemy.z;
            const distToPlayer = Math.sqrt(dx * dx + dz * dz);
            const angleToPlayer = Math.atan2(dx, dz);

            // Turn towards player
            let angleDiff = angleToPlayer - enemy.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            enemy.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.02 * dt);

            // Move towards player (but keep some distance)
            if (distToPlayer > 20) {
                enemy.x += Math.sin(enemy.angle) * enemy.speed * dt;
                enemy.z += Math.cos(enemy.angle) * enemy.speed * dt;
            } else if (distToPlayer < 15) {
                // Back away if too close
                enemy.x -= Math.sin(enemy.angle) * enemy.speed * dt;
                enemy.z -= Math.cos(enemy.angle) * enemy.speed * dt;
            }

            // Shoot at player
            if (now - enemy.lastShot > enemy.shootCooldown && distToPlayer < 60) {
                // Check if roughly aimed at player
                if (Math.abs(angleDiff) < 0.3) {
                    enemy.lastShot = now;

                    this.enemyBullets.push({
                        x: enemy.x + Math.sin(enemy.angle) * 2,
                        z: enemy.z + Math.cos(enemy.angle) * 2,
                        vx: Math.sin(enemy.angle) * this.bulletSpeed * 0.8,
                        vz: Math.cos(enemy.angle) * this.bulletSpeed * 0.8,
                        createdAt: now
                    });

                    sound.play('blip');
                }
            }
        }
    }

    checkCollisions() {
        // Player bullets vs enemies
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const dx = bullet.x - enemy.x;
                const dz = bullet.z - enemy.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < 5) {
                    // Hit!
                    this.bullets.splice(i, 1);
                    enemy.health--;

                    if (enemy.health <= 0) {
                        this.enemies.splice(j, 1);
                        this.score += 100 * this.level;
                        this.killCount++;
                        sound.play('explosion');
                        if (this.killCount >= this.killsPerLevel) {
                            this.killCount = 0;
                            this.nextLevel();
                        }
                    } else {
                        sound.play('hit');
                    }

                    break;
                }
            }
        }

        // Enemy bullets vs player
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            const dx = bullet.x - this.player.x;
            const dz = bullet.z - this.player.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < 3) {
                this.enemyBullets.splice(i, 1);
                this.hitPlayer();
            }
        }

        // Player vs enemies (collision)
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const enemy = this.enemies[j];
            const dx = this.player.x - enemy.x;
            const dz = this.player.z - enemy.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < 4) {
                this.enemies.splice(j, 1);
                this.hitPlayer();
                sound.play('explosion');
            }
        }
    }

    hitPlayer() {
        this.lives--;
        sound.play('death');

        if (this.lives <= 0) {
            this.endGame();
        } else {
            // Respawn
            this.player.x = 0;
            this.player.z = 0;
            this.player.angle = 0;
            this.player.speed = 0;
            this.player.rotationSpeed = 0;

            // Clear bullets near player
            this.enemyBullets = this.enemyBullets.filter(b => {
                const dx = b.x - this.player.x;
                const dz = b.z - this.player.z;
                return Math.sqrt(dx * dx + dz * dz) > 20;
            });
        }
    }

    nextLevel() {
        this.level++;
        this.maxEnemies = 3 + this.level;
        this.showLevelMessage(`LEVEL ${this.level}`);
        sound.play('powerup');
    }

    endGame() {
        this.gameOver = true;
        document.getElementById('finalScore').textContent = `SCORE: ${this.score}`;
        document.getElementById('finalLevel').textContent = `LEVEL: ${this.level}`;
        document.getElementById('gameOver').style.display = 'block';
    }

    render() {
        // Clear main canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Render 3D scene
        this.render3D();

        // Render crosshair
        this.renderCrosshair();

        // Render radar
        this.renderRadar();

        // Update UI
        this.updateUI();
    }

    render3D() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const fov = width / 2; // Field of view scale

        // Set rendering style
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw ground horizon line
        ctx.beginPath();
        ctx.moveTo(0, centerY + 50);
        ctx.lineTo(width, centerY + 50);
        ctx.stroke();

        // Draw perspective ground grid
        this.renderGroundGrid(ctx, width, height, centerX, centerY, fov);

        // Collect all 3D objects to render (with depth sorting)
        const renderQueue = [];

        // Add mountains
        this.mountains.forEach(mountain => {
            const relX = mountain.x - this.player.x;
            const relZ = mountain.z - this.player.z;
            const rotatedX = relX * Math.cos(-this.player.angle) - relZ * Math.sin(-this.player.angle);
            const rotatedZ = relX * Math.sin(-this.player.angle) + relZ * Math.cos(-this.player.angle);

            if (rotatedZ > 1) {
                renderQueue.push({
                    type: 'mountain',
                    x: rotatedX,
                    z: rotatedZ,
                    data: mountain
                });
            }
        });

        // Add enemies
        this.enemies.forEach(enemy => {
            const relX = enemy.x - this.player.x;
            const relZ = enemy.z - this.player.z;
            const rotatedX = relX * Math.cos(-this.player.angle) - relZ * Math.sin(-this.player.angle);
            const rotatedZ = relX * Math.sin(-this.player.angle) + relZ * Math.cos(-this.player.angle);

            if (rotatedZ > 0.1) {
                renderQueue.push({
                    type: 'enemy',
                    x: rotatedX,
                    z: rotatedZ,
                    data: enemy
                });
            }
        });

        // Add bullets
        this.bullets.forEach(bullet => {
            const relX = bullet.x - this.player.x;
            const relZ = bullet.z - this.player.z;
            const rotatedX = relX * Math.cos(-this.player.angle) - relZ * Math.sin(-this.player.angle);
            const rotatedZ = relX * Math.sin(-this.player.angle) + relZ * Math.cos(-this.player.angle);

            if (rotatedZ > 0.1) {
                renderQueue.push({
                    type: 'bullet',
                    x: rotatedX,
                    z: rotatedZ,
                    data: bullet
                });
            }
        });

        // Add enemy bullets
        this.enemyBullets.forEach(bullet => {
            const relX = bullet.x - this.player.x;
            const relZ = bullet.z - this.player.z;
            const rotatedX = relX * Math.cos(-this.player.angle) - relZ * Math.sin(-this.player.angle);
            const rotatedZ = relX * Math.sin(-this.player.angle) + relZ * Math.cos(-this.player.angle);

            if (rotatedZ > 0.1) {
                renderQueue.push({
                    type: 'enemyBullet',
                    x: rotatedX,
                    z: rotatedZ,
                    data: bullet
                });
            }
        });

        // Sort by depth (far to near)
        renderQueue.sort((a, b) => b.z - a.z);

        // Render all objects — project each to the ground plane first
        const horizonY = centerY + 50;
        const camH = 2.5; // camera height (matches renderGroundGrid)
        renderQueue.forEach(obj => {
            const screenX = centerX + (obj.x / obj.z) * fov;
            const scale = Math.min(fov / obj.z, 20); // cap so close objects don't explode
            const groundY = horizonY + (camH / obj.z) * fov; // projected ground Y for this depth

            if (obj.type === 'mountain') {
                this.renderMountain(ctx, screenX, horizonY, scale, obj.data);
            } else if (obj.type === 'enemy') {
                this.renderEnemy(ctx, screenX, groundY, scale, obj.data, obj.x, obj.z);
            } else if (obj.type === 'bullet') {
                // Project at cannon height (1.5 units above ground) so bullets are visible
                const bulletY = horizonY + ((camH - 1.5) / obj.z) * fov;
                this.renderBullet(ctx, screenX, bulletY, scale);
            } else if (obj.type === 'enemyBullet') {
                const bulletY = horizonY + ((camH - 1.5) / obj.z) * fov;
                this.renderEnemyBullet(ctx, screenX, bulletY, scale);
            }
        });
    }

    renderGroundGrid(ctx, width, height, centerX, centerY, fov) {
        const horizonY = centerY + 50;
        const camH = 2.5; // camera height above ground plane
        const cos = Math.cos(-this.player.angle);
        const sin = Math.sin(-this.player.angle);

        // Project a world-space ground point to screen coords
        const project = (worldX, worldZ) => {
            const dx = worldX - this.player.x;
            const dz = worldZ - this.player.z;
            const rx = dx * cos - dz * sin;
            const rz = dx * sin + dz * cos;
            if (rz < 0.5) return null;
            return {
                x: centerX + (rx / rz) * fov,
                y: horizonY + (camH / rz) * fov
            };
        };

        const drawLine = (x1, z1, x2, z2) => {
            const a = project(x1, z1);
            const b = project(x2, z2);
            if (!a || !b) return;
            if (a.y < horizonY && b.y < horizonY) return;
            ctx.beginPath();
            ctx.moveTo(a.x, Math.max(a.y, horizonY));
            ctx.lineTo(b.x, Math.max(b.y, horizonY));
            ctx.stroke();
        };

        ctx.save();
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 0.75;
        ctx.globalAlpha = 0.18;

        const G = 10;  // grid cell size in world units
        const R = 9;   // radius in cells
        const px = Math.round(this.player.x / G);
        const pz = Math.round(this.player.z / G);

        // Lines running in the Z direction (left/right grid lines)
        for (let gx = px - R; gx <= px + R; gx++) {
            drawLine(gx * G, (pz - R) * G, gx * G, (pz + R) * G);
        }
        // Lines running in the X direction (near/far grid lines)
        for (let gz = pz - R; gz <= pz + R; gz++) {
            drawLine((px - R) * G, gz * G, (px + R) * G, gz * G);
        }

        ctx.restore();
    }

    renderMountain(ctx, screenX, screenY, scale, mountain) {
        const width = mountain.width * scale;
        const height = mountain.height * scale;

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(screenX - width / 2, screenY);
        ctx.lineTo(screenX, screenY - height);
        ctx.lineTo(screenX + width / 2, screenY);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    renderEnemy(ctx, screenX, screenY, scale, enemy, relX, relZ) {
        // screenY is the projected ground level — draw tank body upward from here
        const size = Math.min(8 * scale, 80);
        const height = Math.min(10 * scale, 100);

        // Tank body — base at ground (screenY), extends upward
        ctx.beginPath();
        ctx.rect(screenX - size, screenY - height, size * 2, height);
        ctx.stroke();

        // Tank turret — mounted on upper body, points toward player
        const enemyAngleRel = Math.atan2(relX, relZ);
        const turretAngle = enemy.angle - this.player.angle - enemyAngleRel;
        const turretLen = Math.min(size * 1.5, 60);
        const turretBaseY = screenY - height * 0.55;

        ctx.beginPath();
        ctx.moveTo(screenX, turretBaseY);
        ctx.lineTo(
            screenX + Math.sin(turretAngle) * turretLen,
            turretBaseY - Math.cos(turretAngle) * turretLen
        );
        ctx.stroke();

        // Tracks — vertical panels along sides, full body height
        const trackOffset = size * 0.8;
        ctx.beginPath();
        ctx.moveTo(screenX - trackOffset, screenY - height);
        ctx.lineTo(screenX - trackOffset, screenY);
        ctx.moveTo(screenX + trackOffset, screenY - height);
        ctx.lineTo(screenX + trackOffset, screenY);
        ctx.stroke();
    }

    renderBullet(ctx, screenX, screenY, scale) {
        const size = Math.min(2 * scale, 8);
        ctx.fillStyle = '#0f0';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    renderEnemyBullet(ctx, screenX, screenY, scale) {
        const size = Math.min(2 * scale, 8);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#f00';
        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#0f0';
        ctx.globalAlpha = 1;
    }

    renderCrosshair() {
        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = 15;

        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;

        // Cross
        ctx.beginPath();
        ctx.moveTo(centerX - size, centerY);
        ctx.lineTo(centerX - 5, centerY);
        ctx.moveTo(centerX + 5, centerY);
        ctx.lineTo(centerX + size, centerY);
        ctx.moveTo(centerX, centerY - size);
        ctx.lineTo(centerX, centerY - 5);
        ctx.moveTo(centerX, centerY + 5);
        ctx.lineTo(centerX, centerY + size);
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    renderRadar() {
        const ctx = this.radarCtx;
        const size = this.radarCanvas.width;
        const centerX = size / 2;
        const centerY = size / 2;
        const scale = size / 200; // 200 units = full radar

        // Clear
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = '#0f0';
        ctx.fillStyle = '#0f0';

        // Grid
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, size);
        ctx.moveTo(0, centerY);
        ctx.lineTo(size, centerY);
        ctx.stroke();

        // Range circles
        for (let r = 25; r <= 100; r += 25) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r * scale, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Player (center)
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Player direction indicator
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX, centerY - 10);
        ctx.stroke();

        // Enemies
        this.enemies.forEach(enemy => {
            const dx = (enemy.x - this.player.x) * scale;
            const dz = (enemy.z - this.player.z) * scale;

            ctx.beginPath();
            ctx.rect(centerX + dx - 2, centerY + dz - 2, 4, 4);
            ctx.fill();
        });
    }

    updateUI() {
        document.getElementById('score').textContent = `SCORE: ${this.score}`;
        document.getElementById('lives').textContent = `LIVES: ${this.lives}`;
        document.getElementById('level').textContent = `LEVEL: ${this.level}`;
        document.getElementById('enemies').textContent = `ENEMIES: ${this.enemies.length}`;
    }

    gameLoop() {
        const now = performance.now();
        const deltaTime = now - this.lastTime;
        this.lastTime = now;

        this.update(deltaTime);
        this.render();

        window.frameCount = (window.frameCount || 0) + 1;
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Start game when page loads
window.addEventListener('load', () => {
    window.game = new Battlezone();
});
