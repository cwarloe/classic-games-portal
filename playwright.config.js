// @ts-check
const fs = require('fs');
const { defineConfig } = require('@playwright/test');

// Some remote environments ship a pre-installed Chromium here; otherwise use
// the browser from `npx playwright install chromium`.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';

module.exports = defineConfig({
    testDir: './tests',
    timeout: 15000,
    retries: 0,
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        headless: true,
        launchOptions: {
            ...(fs.existsSync(PREINSTALLED_CHROMIUM) ? { executablePath: PREINSTALLED_CHROMIUM } : {}),
            args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox'],
        },
    },
    webServer: {
        command: 'node server.js',
        port: 3000,
        env: { PORT: '3000' },
        reuseExistingServer: true,
        timeout: 10000,
    },
    reporter: [['list'], ['html', { open: 'never' }]],
});
