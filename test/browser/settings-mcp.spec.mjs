import {test, expect} from '@playwright/test';
import {once} from 'node:events';
import {apiConfiguration, createApiServer} from '../../tools/api-server.mjs';
import {mockMcp} from '../fixtures/mcp-server.mjs';

test('desktop Settings moves Mind out of Controls and supports keyboard navigation and Escape', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({width: 1152, height: 720});
  await page.goto('/');
  await page.waitForFunction(() => window.__CELL?.world);
  await page.locator('#go').click();
  await expect(page.locator('#settings-toggle')).toBeVisible();
  expect(await page.locator('#lab #use-brain').count()).toBe(0);
  await page.locator('#settings-toggle').click();
  await expect(page.getByRole('dialog', {name: 'Settings', exact: true})).toBeVisible();
  await expect(page.locator('#settings #use-brain')).toBeVisible();
  await page.locator('#settings-mind-tab').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#settings-mcp-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#mcp-url')).toBeVisible();
  await page.locator('#mcp-token').fill('mock-unsaved-token');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).not.toBeVisible();
  await expect(page.locator('#settings-toggle')).toBeFocused();
  await expect(page.locator('#mcp-token')).toHaveValue('');
});

test('phone MCP settings connect real protocol, gate data on seating, show results in computer and disconnect', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const token = 'mock-computer-data-fixture',
    calls = [],
    errors = [];
  const server = createApiServer(apiConfiguration({}), {fetcher: mockMcp({token, calls})});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const backend = 'http://127.0.0.1:' + server.address().port;
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.route('**/llm/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/llm/, '');
      const response = await route.fetch({url: backend + path});
      await route.fulfill({response});
    });
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/');
    await page.waitForFunction(() => window.__CELL?.world);
    await page.locator('#go').click();
    await page.locator('#controls-toggle').click();
    await page.locator('#settings-toggle').click();
    await expect(page.locator('body')).not.toHaveClass(/controls-open/);
    await page.locator('#settings-mcp-tab').click();
    await page.locator('#mcp-url').fill('https://mcp.invalid/mcp');
    await page.locator('#mcp-name').fill('Weather fixture');
    await page.locator('#mcp-token').fill(token);
    await page.locator('#mcp-token').press('Enter');
    await expect(page.locator('#mcp-status')).toContainText('Weather fixture connected', {
      timeout: 30_000,
    });
    await expect(page.locator('#mcp-token')).toHaveValue('');
    await expect(page.locator('#mcp-catalog')).toContainText('send_message — unavailable');
    const stored = await page.evaluate(
      () => JSON.stringify({...localStorage}) + JSON.stringify({...sessionStorage}),
    );
    expect(stored).not.toContain(token);
    await page.locator('#settings-close').click();
    await page.evaluate(() => {
      const {actions, body, state} = window.__CELL;
      actions.cancelAll();
      state.queue = [];
      state.current = null;
      state.operatorBusy = true;
      body.stop();
      body.setPosture('stand');
    });
    const before = calls.length;
    await page.locator('#pc-btn').click();
    await page.getByRole('button', {name: /MCP data/}).click();
    await expect(page.locator('#pc-win-body')).toContainText('No MCP data retrieved yet');
    expect(calls.length).toBe(before);
    const denied = await page.evaluate(async () => {
      try {
        await window.__CELL.mcp.execute({op: 'call', tool: 'weather', arguments: {city: 'Oslo'}});
        return '';
      } catch (error) {
        return error.message;
      }
    });
    expect(denied).toContain('Sit at the computer');
    expect(calls.length).toBe(before);
    await page.locator('#pc-close').click();
    const result = await page.evaluate(async () => {
      const {body, actions, state} = window.__CELL;
      actions.cancelAll();
      state.queue = [];
      state.current = null;
      state.operatorBusy = true;
      body.stop();
      body.setPosture('sit', actions.SEATS.stool);
      return actions.runResult(
        {do: 'mcp', op: 'call', tool: 'weather', arguments: {city: 'Oslo'}},
        {cancelled: false, signal: new AbortController().signal},
      );
    });
    expect(result.status).toBe('completed');
    expect(result.text).toContain('Sunny in Oslo');
    expect(result.text).not.toContain(token);
    await page.locator('#pc-btn').click();
    await page.getByRole('button', {name: /MCP data/}).click();
    await expect(page.locator('#pc-win-body')).toContainText('Sunny in Oslo');
    await page.locator('#pc-close').click();
    await page.locator('#settings-toggle').click();
    await page.locator('#mcp-disconnect').click();
    await expect(page.locator('#mcp-status')).toHaveText('MCP disconnected.');
    expect(errors).toEqual([]);
  } finally {
    await page.unrouteAll({behavior: 'wait'}).catch(() => {});
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});
