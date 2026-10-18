import {test,expect} from '@playwright/test';

test('desktop panels minimize independently and JSON Brain moves by its title bar',async({page})=>{
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