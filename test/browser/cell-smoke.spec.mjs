import {test,expect} from '@playwright/test';

const allowedRequest=url=>{
  const value=new URL(url);
  return ['127.0.0.1','localhost'].includes(value.hostname)||['data:','blob:','about:'].includes(value.protocol);
};

async function openFresh(page,request,{width=1440,height=900}={}){
  await request.post('http://127.0.0.1:18081/__reset');
  await page.setViewportSize({width,height});
  const pageErrors=[],consoleErrors=[],external=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('request',req=>{if(!allowedRequest(req.url()))external.push(req.url());});
  await page.goto('/');
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.waitForFunction(()=>window.__CELL?.world&&window.__CELL?.mind);
  return {pageErrors,consoleErrors,external};
}

async function startFeed(page){
  await expect(page.locator('#go')).toBeVisible({timeout:20_000});
  await page.locator('#go').click({force:true});
  await expect.poll(()=>page.evaluate(()=>window.__CELL.state.started)).toBe(true);
}

async function connectMockAgent(page){
  await page.getByRole('button',{name:'Invite agent'}).click();
  await page.locator('#invite-name').fill('Mock T-800');
  await page.locator('#invite-base').fill('http://127.0.0.1:9999/v1');
  await page.locator('#invite-model').fill('mock-model');
  // Submit from the model field; accessible button names can be transient during HUD repaint.
  await page.locator('#invite-model').press('Enter');
  await expect(page.locator('#agent-connection-state')).toContainText('Mock T-800');
  await expect(page.locator('#use-brain')).toBeChecked();
}

async function sendIntercom(page,text){
  const before=await page.evaluate(()=>window.__CELL.state.journal.filter(entry=>entry.kind==='say').length);
  await page.locator('#ask').fill(text);
  await page.locator('#ask-btn').click();
  await expect.poll(()=>page.evaluate(()=>window.__CELL.state.journal.filter(entry=>entry.kind==='say').length),{timeout:15_000}).toBeGreaterThan(before);
}

test('desktop startup, mocked connection, consecutive replies, fresh inspection and computer',async({page,request})=>{
  const observed=await openFresh(page,request);
  await expect(page.locator('#start')).not.toHaveClass(/gone/);
  await startFeed(page);
  await connectMockAgent(page);

  await sendIntercom(page,'How are you?');
  await sendIntercom(page,'What are you thinking about?');
  await expect(page.locator('#mind')).toContainText('Mock reply 2.');

  await page.locator('#ask').fill('inspect the table');
  await page.locator('#ask-btn').click();
  await expect.poll(async()=>{
    const state=await request.get('http://127.0.0.1:18081/__state');
    return (await state.json()).visionCalls;
  },{timeout:20_000}).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>window.__CELL.state.journal.some(entry=>entry.kind==='result'&&/table|puzzle cube/i.test(entry.text))),{timeout:20_000}).toBe(true);

  await page.locator('#pc-btn').click();
  await expect(page.locator('#pc')).toBeVisible();
  await page.locator('#pc-close').click();
  await expect(page.locator('#pc')).toBeHidden();

  await page.locator('#agent-disconnect').click();
  await expect(page.locator('#use-brain')).not.toBeChecked();
  await expect(page.locator('#agent-connection-state')).toContainText('no API configured');

  expect(observed.external).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.consoleErrors.filter(line=>!/THREE\.WebGLRenderer|AudioContext/i.test(line))).toEqual([]);
});

for(const viewport of [
  {name:'narrow portrait',width:390,height:844},
  {name:'short landscape',width:844,height:390},
]){
  test(viewport.name+' compact panels remain usable',async({page,request})=>{
    const observed=await openFresh(page,request,viewport);
    await startFeed(page);
    await page.locator('#controls-toggle').click({force:true});
    await expect(page.locator('body')).toHaveClass(/controls-open/);
    await expect(page.locator('#lab .mobile-panel-close')).toBeVisible();
    await page.locator('#lab .mobile-panel-close').click({force:true});
    await expect(page.locator('body')).not.toHaveClass(/controls-open/);
    await page.locator('#memory-toggle').click({force:true});
    await expect(page.locator('body')).toHaveClass(/memory-open/);
    expect(observed.external).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}

test('reset keeps one compatible undo slot and restores namespaced state',async({page,request})=>{
  await openFresh(page,request);
  await page.evaluate(()=>localStorage.setItem('cell-public-test.marker','kept-for-undo'));
  await startFeed(page);
  await Promise.all([page.waitForEvent('framenavigated'),page.locator('#forget').click()]);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>window.__CELL?.world);
  expect(await page.evaluate(()=>localStorage.getItem('cell-public-test.marker'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('cell-session-reset-backup.v1'))).not.toBeNull();

  await startFeed(page);
  await Promise.all([page.waitForEvent('framenavigated'),page.getByRole('button',{name:'Restore previous session'}).click()]);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>window.__CELL?.world);
  expect(await page.evaluate(()=>localStorage.getItem('cell-public-test.marker'))).toBe('kept-for-undo');
});

test('fresh startup records a reproducible local browser baseline',async({page,request})=>{
  await openFresh(page,request);
  const metrics=await page.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0];
    const resources=performance.getEntriesByType('resource');
    return {
      domContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd||0),
      loadMs:Math.round(nav?.loadEventEnd||0),
      resourceCount:resources.length,
      transferredBytes:Math.round(resources.reduce((sum,item)=>sum+(item.transferSize||0),0)),
    };
  });
  console.log('browser-baseline',JSON.stringify(metrics));
  expect(metrics.resourceCount).toBeGreaterThan(0);
});
