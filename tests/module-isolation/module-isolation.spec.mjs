import { expect, test } from '@playwright/test';

for (const scenario of [
  { failedModule: 'Jobs', availableModule: 'Ads Brain', readyTestId: 'ads-brain-ready', blockedFile: 'Jobs.jsx' },
  { failedModule: 'AdsBrain', availableModule: 'Jobs', readyTestId: 'jobs-ready', blockedFile: 'AdsBrain.jsx' },
]) {
  test(`${scenario.failedModule} chunk failure stays isolated and the other route works`, async ({ page }) => {
    let failedChunkRequests = 0;
    await page.route(`**/tests/module-isolation/modules/${scenario.blockedFile}*`, (route) => {
      failedChunkRequests += 1;
      return route.abort();
    });
    const initialRoute = scenario.failedModule === 'Jobs' ? '/Jobs' : '/AdsBrain';
    await page.goto(`/tests/module-isolation/index.html?initial=${initialRoute}`);

    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
    expect(new URL(page.url()).searchParams.has('_cb')).toBe(true);
    expect(failedChunkRequests).toBeGreaterThanOrEqual(2);
    await page.getByRole('link', { name: scenario.availableModule }).click();
    await expect(page.getByTestId(scenario.readyTestId)).toBeVisible();

    await page.getByRole('link', { name: scenario.failedModule === 'AdsBrain' ? 'Ads Brain' : 'Jobs' }).click();
    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
  });
}
