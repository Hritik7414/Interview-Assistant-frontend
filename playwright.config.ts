import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
const SERVER_PORT = 4100;

/** The backend is a separate project; by default it sits next to this one. */
const BACKEND_DIR = process.env.E2E_BACKEND_DIR
  ? resolve(process.env.E2E_BACKEND_DIR)
  : fileURLToPath(new URL('../backend', import.meta.url));
if (!existsSync(join(BACKEND_DIR, 'node_modules'))) {
  throw new Error(
    `E2E needs the backend project with its dependencies installed at ${BACKEND_DIR}. ` +
      'Run `npm install` there, or set E2E_BACKEND_DIR to its location.',
  );
}

/**
 * E2E runs the real backend (Demo Mode, no credentials) and the production
 * Next.js build. Chromium's fake media devices provide genuine microphone input.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start:e2e',
      cwd: BACKEND_DIR,
      url: `http://localhost:${SERVER_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'production',
        PORT: String(SERVER_PORT),
        HOST: '127.0.0.1',
        LOG_LEVEL: 'warn',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        MOCK_SCRIPT_SPEED: '2.5',
        DEEPGRAM_API_KEY: '',
        OPENAI_API_KEY: '',
      },
    },
    {
      command: `npx next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { PUBLIC_SERVER_URL: `http://localhost:${SERVER_PORT}` },
    },
  ],
});
