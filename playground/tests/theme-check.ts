import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.MARKSWIFT_PLAYGROUND_URL ?? "http://127.0.0.1:4317";
try {
 const page = await browser.newPage({colorScheme:null,viewport:{width:1450,height:1000}});
 await page.goto(base);
 await page.locator('#sample').click();
 await page.locator('#theme').selectOption('dark');
 await page.locator('#mode').selectOption('fidelity');
 await page.waitForTimeout(350);
 const background = await page.frameLocator('#preview').locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
 if(background !== 'rgb(23, 35, 43)')throw Error('Dark HTML preview mismatch: '+background);
 await page.locator('#convert').click();
 await page.locator('#code-view').waitFor({state:'visible',timeout:45_000});
 await page.locator('#render').click();
 await page.waitForFunction(()=>['Native render complete','Render failed'].includes(document.querySelector('#native-status')?.textContent??''),{},{timeout:260_000});
 if((await page.locator('#native-status').textContent())!=='Native render complete')throw Error(await page.locator('#notice').textContent()??'Native failure');
 await page.waitForFunction(()=>{const i=document.querySelector<HTMLImageElement>('#native-image');return i?.complete&&i.naturalWidth>0;});
 await page.screenshot({path:new URL('../.cache/checks/dark.png',import.meta.url).pathname,fullPage:true});
 console.log('Dark browser theme and native fidelity render passed');
} finally {await browser.close();}
