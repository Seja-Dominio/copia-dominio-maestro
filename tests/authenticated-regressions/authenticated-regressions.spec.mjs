import { expect, test } from '@playwright/test';

const supabaseOrigin = 'https://tqmfuskvllpqmvayjuqu.supabase.co';
const collaborator = {
  id: 'regression-collaborator',
  name: 'Colaborador de Teste',
  email: 'regression@example.invalid',
  access_level: 'master',
  is_active: true,
  permissions: { tabs: { Financial: true } },
};

async function authenticateTestCollaborator(page) {
  const tokenPayload = Buffer.from(JSON.stringify({
    sub: collaborator.id,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })).toString('base64url');
  const testSessionToken = `${tokenPayload}.regression-signature`;

  const requests = [];
  await page.route(`${supabaseOrigin}/**`, async (route) => {
    const request = route.request();
    if (request.url().includes('/functions/v1/')) {
      let payload = {};
      try { payload = JSON.parse(request.postData() || '{}'); } catch { /* return empty test data */ }
      const endpoint = new URL(request.url()).pathname.split('/').pop();
      requests.push({ endpoint, payload });
      if (endpoint === 'collaborator-login') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, collaborator, session_token: testSessionToken }),
        });
        return;
      }
      const data = payload.operation === 'dashboard' ? {} : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await page.getByLabel('Usuário').fill('regression-user');
  await page.getByRole('textbox', { name: 'Senha' }).fill('fake-regression-password');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Jobs', exact: true })).toBeVisible();
  expect(requests.some(({ endpoint }) => endpoint === 'collaborator-login')).toBe(true);

  return requests;
}

test('mocked collaborator login opens Jobs and the global tasks drawer without leaving the route', async ({ page }) => {
  const requests = await authenticateTestCollaborator(page);
  await page.goto('/Jobs');

  await expect(page.getByRole('link', { name: 'Jobs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Todos os Jobs/ })).toBeVisible();
  const documentId = await page.evaluate(() => performance.timeOrigin);

  await page.getByRole('button', { name: 'To-Do List' }).click();
  await expect(page.getByRole('heading', { name: 'Minhas Tarefas' })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  expect(requests.some(({ payload }) => payload.entity === 'MiniTask' && payload.operation === 'filter')).toBe(true);
  expect(requests.some(({ payload }) => ['create', 'delete'].includes(payload.operation))).toBe(false);
});

test('mocked collaborator login opens Financeiro and its Acompanhamento tab', async ({ page }) => {
  await authenticateTestCollaborator(page);
  await page.goto('/Financial');

  await expect(page.getByRole('link', { name: 'Financeiro', exact: true })).toBeVisible();
  await expect(page.getByText('Acompanhamento', { exact: true }).first()).toBeVisible();
});

test('mocked collaborator login opens Ads Brain while another route remains reachable', async ({ page }) => {
  await authenticateTestCollaborator(page);
  await page.goto('/AdsBrain');

  await expect(page.getByRole('link', { name: 'Ads Brain', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Jobs', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await expect(page).toHaveURL(/\/Jobs$/);
  await expect(page.getByRole('button', { name: /Todos os Jobs/ })).toBeVisible();
});
