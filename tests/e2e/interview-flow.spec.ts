import { expect, test } from '@playwright/test';

/**
 * Full pipeline against the real backend in Demo Mode (no credentials):
 * Start → microphone audio (Chromium fake device) → WebSocket → transcript →
 * question detection → token-streamed answer → diagnostics → Stop.
 */
test('demo session streams transcript, detects a question and streams an answer', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cue' })).toBeVisible();
  await expect(page.getByText('Server online')).toBeVisible();

  await page
    .getByPlaceholder(/Paste your resume/)
    .fill('Senior backend engineer, six years building payment systems with Go and Postgres.');

  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.locator('[data-status="listening"]')).toBeVisible();
  await expect(page.getByText(/Connected/)).toBeVisible();

  // Interim + final transcript produced from the streamed microphone audio.
  const transcript = page.getByTestId('transcript-lines');
  await expect(transcript).toContainText('Hi, thanks for joining us today.');
  await expect(page.getByText('Simulated transcript')).toBeVisible();

  // The greeting is ignored; the real question is detected.
  const question = page.getByTestId('active-question');
  await expect(question).toContainText('walk me through your background');

  // The answer streams token by token: the cancel control is visible mid-stream…
  const answer = page.getByTestId('answer-content');
  await expect(answer).toContainText('[current title]');
  const partialLength = (await answer.innerText()).length;

  // …and the completed answer is longer, with placeholders instead of invented facts.
  await expect(page.getByRole('button', { name: 'Copy answer' })).toBeVisible();
  const finalText = await answer.innerText();
  expect(finalText.length).toBeGreaterThan(partialLength);
  expect(finalText).toContain('[company]');
  await expect(page.getByText('Simulated answer')).toBeVisible();

  // Diagnostics receive latency metrics from the server.
  await expect(page.getByRole('row', { name: /LLM first token/ })).not.toContainText('—');
  await expect(page.getByRole('row', { name: /Audio ingest/ })).not.toContainText('—');

  await page.getByRole('button', { name: 'Stop listening' }).click();
  await expect(page.getByRole('button', { name: 'Start listening' })).toBeEnabled();
  await expect(page.locator('[data-status="ready"]')).toBeVisible();
  // The transcript remains available after stopping.
  await expect(transcript).toContainText('walk me through your background');
});

test('live mode is disabled with an explanation when the server has no API keys', async ({
  page,
}) => {
  await page.goto('/');
  const live = page.getByRole('radio', { name: 'Live' });
  await expect(live).toBeDisabled();
  await expect(page.getByText(/DEEPGRAM_API_KEY/)).toBeVisible();
});

test('simulated input runs Demo Mode without a microphone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Audio source' }).click();
  await page.getByRole('option', { name: /Simulated input/ }).click();
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.getByTestId('active-question')).toContainText(
    'walk me through your background',
  );
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await expect(page.locator('[data-status="ready"]')).toBeVisible();
});
