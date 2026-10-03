import { expect, test } from '@playwright/test';

for (const scenario of [
  { failedModule: 'Jobs', availableModule: 'Ads Brain', readyTestId: 'ads-brain-ready', blockedFile: 'Jobs.jsx' },
  { failedModule: 'AdsBrain', availableModule: 'Jobs', readyTestId: 'jobs-ready', blockedFile: 'AdsBrain.jsx' },
]) {
  test(`${scenario.failedModule} chunk failure stays isolated and the other route works`, async ({ page }) => {
    await page.route(`**/tests/module-isolation/modules/${scenario.blockedFile}*`, (route) => route.abort());
    const initialRoute = scenario.failedModule === 'Jobs' ? '/Jobs' : '/AdsBrain';
    await page.goto(`/tests/module-isolation/index.html?initial=${initialRoute}`);

    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
    await page.getByRole('link', { name: scenario.availableModule }).click();
    await expect(page.getByTestId(scenario.readyTestId)).toBeVisible();

    await page.getByRole('link', { name: scenario.failedModule === 'AdsBrain' ? 'Ads Brain' : 'Jobs' }).click();
    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
  });
}
