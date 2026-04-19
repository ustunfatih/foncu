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

  // Use JSON escaping semantics (quotes, backslashes, control chars) for reliable matching
  const expectedPayloadInJson = JSON.stringify(maliciousPayload).slice(1, -1);
  expect(outputText).toContain(expectedPayloadInJson);

  // Cleanup
  await page.evaluate(() => {
    localStorage.removeItem('maliciousKey');
  });
});
