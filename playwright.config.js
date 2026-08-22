// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 15000,
    retries: 0,
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        headless: true,
        // Use the pre-installed Chromium binary (symlinked by the remote environment)
        launchOptions: {
            executablePath: '/opt/pw-browsers/chromium',
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
