import {test,expect} from '@playwright/test';

test('desktop panels minimize independently and JSON Brain moves by its title bar',async({page})=>{
 test.setTimeout(240_000); // GitHub Actions runs WebGL through software SwiftShader.
 await page.setViewportSize({width:1600,height:900});
 await page.goto('/');
 await page.locator('#go').click({force:true});

 const brain=page.locator('.json-brain[data-context=cell]');
 const mind=page.locator('#mindpanel');
 const thoughts=page.locator('#thought-row');
 const dialogue=page.locator('#dialogue');
 await expect(brain.locator('.panel-minimize')).toBeVisible();

 for(const [panel,label,content] of [
  [brain,'JSON Brain','.jb-viewport'],
  [mind,'Mind Stream','#mind'],
  [thoughts,'Thoughts','#thought'],
  [dialogue,'Dialogue','#line'],
 ]){
  const button=panel.locator('.panel-minimize');
  await expect(button).toHaveAttribute('aria-label','Minimize '+label);
  await expect(panel.locator(content)).toBeVisible();
  await button.click({force:true});
  await expect(panel).toHaveClass(/panel-minimized/);
  await expect(panel.locator(content)).toBeHidden();
  await expect(button).toHaveAttribute('aria-label','Restore '+label);
  await expect(button).toHaveAttribute('aria-expanded','false');
  await button.click({force:true});
  await expect(panel).not.toHaveClass(/panel-minimized/);
  await expect(panel.locator(content)).toBeVisible();
 }

 // The thought and dialogue toggles must not hide each other or the intercom.
 await thoughts.locator('.panel-minimize').click({force:true});
 await expect(dialogue.locator('#line')).toBeVisible();
 await expect(page.locator('#ask')).toBeVisible();
 await thoughts.locator('.panel-minimize').click({force:true});

 const heading=brain.locator('.jb-heading');
 const before=await brain.boundingBox();
 await page.mouse.move(before.x+24,before.y+16);
 await page.mouse.down();
 await page.mouse.move(before.x+105,before.y-34,{steps:5});
 await page.mouse.up();
 const moved=await brain.boundingBox();
 expect(moved.x).toBeGreaterThan(before.x+50);
 expect(moved.y).toBeLessThan(before.y-20);
 await expect(brain).toHaveClass(/panel-positioned/);

 await heading.focus();
 await page.keyboard.press('ArrowRight');
 const keyboardMoved=await brain.boundingBox();
 expect(keyboardMoved.x).toBeGreaterThan(moved.x+10);
 await page.keyboard.press('Home');
 await expect(brain).not.toHaveClass(/panel-positioned/);
});
test('phone thought row keeps the start of long thoughts visible',async({page})=>{
 test.setTimeout(240_000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('#go').click({force:true});
 const long='and i feel the mild ache in my chassis as i stand here holding this book, the quiet of the room suddenly broken by the crackle of the intercom. it is a simple greeting, but it provides a point of contact in the isolation.';
 await page.evaluate(text=>{document.getElementById('thought').textContent=text;},long);
 const box=await page.evaluate(()=>{
  const row=document.getElementById('thought-row').getBoundingClientRect();
  const label=document.querySelector('#thought-row b').getBoundingClientRect();
  const thought=document.getElementById('thought');
  const t=thought.getBoundingClientRect();
  return {rowTop:row.top,labelBottom:label.bottom,thoughtTop:t.top,scrollTop:thought.scrollTop,scrollable:thought.scrollHeight>thought.clientHeight};
 });
 // The label sits above the text and the first line is not clipped above the row.
 expect(box.thoughtTop).toBeGreaterThanOrEqual(box.rowTop);
 expect(box.thoughtTop).toBeGreaterThanOrEqual(box.labelBottom-1);
 expect(box.scrollTop).toBe(0);
 expect(box.scrollable).toBe(true);
});
