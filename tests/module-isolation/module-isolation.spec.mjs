import { expect, test } from '@playwright/test';

const scenarios = [
  { failedModule: 'Jobs', availableModule: 'Ads Brain', readyTestId: 'ads-brain-ready', blockedFile: 'Jobs.jsx' },
  { failedModule: 'AdsBrain', availableModule: 'Jobs', readyTestId: 'jobs-ready', blockedFile: 'AdsBrain.jsx' },
  { failedModule: 'Dashboard', availableModule: 'Financeiro', readyTestId: 'financial-ready', blockedFile: 'Dashboard.jsx', failedRouteTestId: 'route-dashboard' },
  { failedModule: 'Financial', availableModule: 'Dashboard', readyTestId: 'dashboard-ready', blockedFile: 'Financial.jsx', failedRouteTestId: 'route-financial' },
];

for (const scenario of scenarios) {
  test(`${scenario.failedModule} chunk failure stays isolated and the other route works`, async ({ page }) => {
    let failedChunkRequests = 0;
    await page.route(`**/tests/module-isolation/modules/${scenario.blockedFile}*`, (route) => {
      failedChunkRequests += 1;
      return route.abort();
    });
    const initialRoute = `/${scenario.failedModule}`;
    await page.goto(`/tests/module-isolation/index.html?initial=${initialRoute}`);
    const documentId = await page.evaluate(() => window.__moduleIsolationDocumentId);

    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
    expect(await page.evaluate(() => window.__moduleIsolationDocumentId)).toBe(documentId);
    expect(failedChunkRequests).toBeGreaterThanOrEqual(1);
    await page.getByRole('link', { name: scenario.availableModule }).click();
    await expect(page.getByTestId(scenario.readyTestId)).toBeVisible();

    await page.getByTestId(scenario.failedRouteTestId || `route-${scenario.failedModule.toLowerCase()}`).click();
    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
  });
}

for (const scenario of scenarios) {
  test(`${scenario.failedModule} render failure stays isolated and the other route works`, async ({ page }) => {
    const initialRoute = `/${scenario.failedModule}`;
    await page.goto(`/tests/module-isolation/index.html?initial=${initialRoute}&crash=${scenario.failedModule}`);

    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
    const documentId = await page.evaluate(() => window.__moduleIsolationDocumentId);
    await page.getByRole('link', { name: scenario.availableModule }).click();
    await expect(page.getByTestId(scenario.readyTestId)).toBeVisible();
    expect(await page.evaluate(() => window.__moduleIsolationDocumentId)).toBe(documentId);

    await page.getByTestId(scenario.failedRouteTestId || `route-${scenario.failedModule.toLowerCase()}`).click();
    await expect(page.getByRole('alert')).toContainText('Erro ao carregar');
    expect(await page.evaluate(() => window.__moduleIsolationDocumentId)).toBe(documentId);
  });
}
