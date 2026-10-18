import {test, expect} from '@playwright/test';

test('HTTP phone startup opens the feed and records events without randomUUID', async ({page, baseURL}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({width: 390, height: 844});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  // Give the browser a real insecure origin while keeping the server on loopback.
  await page.route('http://cell.test/**', async route => {
    const response = await route.fetch({
      url: route.request().url().replace('http://cell.test', baseURL),
    });
    await route.fulfill({response});
  });
  await page.goto('http://cell.test/');
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await page.waitForFunction(() => window.__CELL?.world && window.__CELL?.mind);
  await page.locator('#go').click();
  await expect(page.locator('#start')).toHaveClass(/gone/);
  await expect.poll(() => page.evaluate(() => window.__CELL.state.started)).toBe(true);
  await expect(page.locator('#world canvas')).toBeVisible();
  await expect(page.locator('.json-brain[data-context=cell]')).toBeAttached();
  await expect(page.locator('#use-brain')).not.toBeChecked();
  // Exercise IDs generated after startup by the journal, memory sampler and action queue.
  await page.locator('#ask').fill('stand up');
  await page.locator('#ask').press('Enter');
  await expect.poll(() => page.evaluate(() =>
    window.__CELL.state.journal.some(entry => entry.kind === 'result')
  ), {timeout: 60_000}).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('cell-public-cell.v1'));
    return saved?.sessionMemory?.sessions?.length || 0;
  })).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
