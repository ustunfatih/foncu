import { test, expect } from '@playwright/test';

test('Verify clear-cache.html prevents XSS on storage output', async ({ page }) => {
  const filePath = `file://${process.cwd()}/public/clear-cache.html`;

  await page.goto(filePath);

  // Inject a malicious payload into localStorage
  const maliciousPayload = `<img src="x" onerror="window.xssTriggered = true">`;
  await page.evaluate((payload) => {
    localStorage.setItem('maliciousKey', payload);
  }, maliciousPayload);

  // Click the "Mevcut Storage'ı Göster" button
  await page.click('button:has-text("Mevcut Storage\'ı Göster")');

  // Check if xssTriggered is defined on the window object
  const xssTriggered = await page.evaluate(() => (window as any).xssTriggered);
  expect(xssTriggered).toBeFalsy();

  // Verify that the payload is safely rendered as text
  const outputText = await page.locator('#output pre').textContent();

  // Parse the output to verify the unescaped payload
  const parsedOutput = JSON.parse(outputText || '{}');
  expect(parsedOutput.localStorage?.maliciousKey).toBe(maliciousPayload);

  // Cleanup
  await page.evaluate(() => {
    localStorage.removeItem('maliciousKey');
  });
});
