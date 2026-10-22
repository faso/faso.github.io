import { defineConfig, devices } from '@playwright/test';

// Local-only suite. Spins up the Vite dev server for the frontend and drives it
// with headless Chromium. WebGL is forced on via swiftshader so the rectify
// warp + 3D viewer actually render in headless. NOT wired into CI yet.
export default defineConfig({
  testDir: '.',
  fullyParallel: false, // each test is heavy (WebGL); keep it predictable
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.BOXRIPPER_URL || 'http://localhost:5180',
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BOXRIPPER_URL ? undefined : {
    command: 'npm run dev -- --port 5180 --strictPort',
    cwd: '..',
    url: 'http://localhost:5180/boxripper/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
