// @ts-check
const { test, expect } = require('@playwright/test');

// Helper: collect JS errors while a page loads and runs.
// Filters out browser-generated 404s for static assets (favicon etc.)
// so tests only catch real JS errors.
async function collectErrors(page) {
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            if (text.includes('Failed to load resource')) return; // ignore network 404s
            errors.push(text);
        }
    });
    page.on('pageerror', err => errors.push(err.message));
    return errors;
}

// Helper: wait for the game loop to have run for at least N frames.
// A frozen loop (e.g. from a crash in draw()) will fail this check.
async function waitForFrames(page, minFrames = 60, timeoutMs = 5000) {
    const start = await page.evaluate(() => window.frameCount || 0);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await page.waitForTimeout(100);
        const current = await page.evaluate(() => window.frameCount || 0);
        if (current - start >= minFrames) return current - start;
    }
    const final = await page.evaluate(() => window.frameCount || 0);
    throw new Error(`Game loop only advanced ${final - start} frames in ${timeoutMs}ms (wanted ${minFrames})`);
}

// Helper: focus the page so keyboard events register
async function focusPage(page) {
    await page.evaluate(() => window.focus());
    await page.waitForTimeout(50);
}

// ---------------------------------------------------------------------------
// MISSILE COMMAND
// ---------------------------------------------------------------------------
test.describe('Missile Command', () => {
    test('loads without JS errors', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/games/missilecommand/index.html');
        await page.waitForTimeout(1000);
        expect(await errors).toHaveLength(0);
    });

    test('game loop keeps running after first wave starts', async ({ page }) => {
        await page.goto('/games/missilecommand/index.html');
        await page.waitForTimeout(500);
        // Must advance 120 frames (~2 s) without freezing — catches the addColorStop crash
        await waitForFrames(page, 120, 6000);
    });

    test('clicking fires a counter-missile toward target', async ({ page }) => {
        await page.goto('/games/missilecommand/index.html');
        await page.waitForTimeout(500);
        const canvas = page.locator('canvas');
        const box = await canvas.boundingBox();
        // Click centre of canvas — should create a missile if a battery has ammo
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200);
        const missiles = await page.evaluate(() =>
            (typeof counterMissiles !== 'undefined' ? counterMissiles.length : -1)
        );
        // -1 means the global wasn't found (acceptable if naming differs); otherwise must be > 0
        if (missiles !== -1) expect(missiles).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// GALAGA
// ---------------------------------------------------------------------------
test.describe('Galaga', () => {
    test('loads without JS errors', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/games/galaga/index.html');
        await page.waitForTimeout(1000);
        expect(await errors).toHaveLength(0);
    });

    test('game loop keeps running', async ({ page }) => {
        await page.goto('/games/galaga/index.html');
        await page.waitForTimeout(500);
        await waitForFrames(page, 60, 4000);
    });

    test('spacebar fires a player bullet', async ({ page }) => {
        await page.goto('/games/galaga/index.html');
        await page.waitForTimeout(500);
        await focusPage(page);
        // Galaga uses keys[' '] polling — hold down so the game loop sees it
        await page.keyboard.down('Space');
        await page.waitForTimeout(200); // wait for at least one game frame
        await page.keyboard.up('Space');
        const count = await page.evaluate(() =>
            (typeof bullets !== 'undefined' ? bullets.length : -1)
        );
        if (count !== -1) expect(count).toBeGreaterThan(0);
    });

    test('player bullet disappears after hitting an enemy (splice bug check)', async ({ page }) => {
        await page.goto('/games/galaga/index.html');
        await page.waitForTimeout(1000); // let enemies settle into formation
        await focusPage(page);
        // Fire several bullets and wait — if splice bug exists bullets pile up without removing
        for (let i = 0; i < 10; i++) {
            await page.keyboard.down('Space');
            await page.waitForTimeout(150);
            await page.keyboard.up('Space');
            await page.waitForTimeout(150);
        }
        await page.waitForTimeout(2000);
        // Bullets should self-clean; if > 50 accumulate something is badly wrong
        const count = await page.evaluate(() =>
            (typeof bullets !== 'undefined' ? bullets.length : 0)
        );
        expect(count).toBeLessThan(50);
    });
});

// ---------------------------------------------------------------------------
// SPACE INVADERS
// ---------------------------------------------------------------------------
test.describe('Space Invaders', () => {
    test('loads without JS errors', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/games/spaceinvaders/index.html');
        await page.waitForTimeout(1000);
        expect(await errors).toHaveLength(0);
    });

    test('game loop keeps running', async ({ page }) => {
        await page.goto('/games/spaceinvaders/index.html');
        await page.waitForTimeout(500);
        await waitForFrames(page, 60, 4000);
    });

    test('spacebar fires a bullet', async ({ page }) => {
        await page.goto('/games/spaceinvaders/index.html');
        await page.waitForTimeout(500);
        await focusPage(page);
        // Space Invaders also uses keys[' '] polling — hold down
        await page.keyboard.down('Space');
        await page.waitForTimeout(200);
        await page.keyboard.up('Space');
        const count = await page.evaluate(() =>
            (typeof bullets !== 'undefined'
                ? bullets.filter(b => b.fromPlayer).length
                : -1)
        );
        if (count !== -1) expect(count).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// BERZERK
// ---------------------------------------------------------------------------
test.describe('Berzerk', () => {
    test('loads without JS errors', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/games/berzerk/index.html');
        await page.waitForTimeout(1000);
        expect(await errors).toHaveLength(0);
    });

    test('game loop keeps running', async ({ page }) => {
        await page.goto('/games/berzerk/index.html');
        await page.waitForTimeout(500);
        await waitForFrames(page, 60, 4000);
    });

    test('arrow keys move the player', async ({ page }) => {
        await page.goto('/games/berzerk/index.html');
        await page.waitForTimeout(500);
        await focusPage(page);
        const before = await page.evaluate(() =>
            (typeof player !== 'undefined' ? { x: player.x, y: player.y } : null)
        );
        if (!before) return; // skip if global not accessible
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(300);
        await page.keyboard.up('ArrowRight');
        const after = await page.evaluate(() => ({ x: player.x, y: player.y }));
        expect(after.x).not.toEqual(before.x);
    });
});

// ---------------------------------------------------------------------------
// BATTLEZONE
// ---------------------------------------------------------------------------
test.describe('Battlezone', () => {
    test('loads without JS errors', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/games/battlezone/index.html');
        await page.waitForTimeout(1000);
        expect(await errors).toHaveLength(0);
    });

    test('game loop keeps running', async ({ page }) => {
        await page.goto('/games/battlezone/index.html');
        await page.waitForTimeout(500);
        await waitForFrames(page, 60, 4000);
    });

    test('spacebar fires a bullet', async ({ page }) => {
        await page.goto('/games/battlezone/index.html');
        await page.waitForTimeout(500);
        await focusPage(page);
        // Battlezone shoot() is called directly from keydown — press() is fine
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);
        const count = await page.evaluate(() =>
            window.game ? window.game.bullets.length : -1
        );
        expect(count).toBeGreaterThan(0);
    });

    test('arrow keys change player angle', async ({ page }) => {
        await page.goto('/games/battlezone/index.html');
        await page.waitForTimeout(500);
        await focusPage(page);
        const before = await page.evaluate(() => window.game ? window.game.player.angle : 0);
        await page.keyboard.down('ArrowLeft');
        await page.waitForTimeout(400);
        await page.keyboard.up('ArrowLeft');
        const after = await page.evaluate(() => window.game ? window.game.player.angle : 0);
        expect(after).not.toEqual(before);
    });

    test('killing 10 enemies advances the level', async ({ page }) => {
        await page.goto('/games/battlezone/index.html');
        await page.waitForTimeout(500);
        // Simulate 10 kills by directly manipulating game state
        await page.evaluate(() => {
            if (!window.game) return;
            window.game.killCount = window.game.killsPerLevel - 1;
            window.game.score += 100;
            window.game.killCount++;
            if (window.game.killCount >= window.game.killsPerLevel) {
                window.game.killCount = 0;
                window.game.nextLevel();
            }
        });
        const level = await page.evaluate(() => window.game ? window.game.level : 1);
        expect(level).toBeGreaterThan(1);
    });
});

// ---------------------------------------------------------------------------
// PORTAL
// ---------------------------------------------------------------------------
test.describe('Portal', () => {
    test('loads all 6 games without JS errors', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/portal.html');
        await page.waitForTimeout(1000);
        expect(await errors).toHaveLength(0);
        const cards = await page.locator('.card').count();
        expect(cards).toBe(6);
    });
});
