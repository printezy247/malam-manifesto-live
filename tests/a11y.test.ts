import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type ViteDevServer} from 'vite';
import {chromium,type Browser,type Page} from '@playwright/test';
import {AxeBuilder} from '@axe-core/playwright';

// axe-core accessibility audit against the real built pages served by Vite dev.
// Covers the control desk (pairing + desk chrome), the overlay chrome and the
// 40-composition gallery, which embeds every Broadcast scene.
let vite:ViteDevServer;let browser:Browser;let base='';

before(async()=>{
  vite=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'silent'});
  await vite.listen();
  const addr=vite.httpServer?.address();
  assert.ok(addr&&typeof addr==='object');
  base=`http://127.0.0.1:${addr.port}`;
  browser=await chromium.launch();
});
after(async()=>{await browser?.close();await vite?.close();});

async function audit(path:string,ready:string) {
  const context=await browser.newContext();
  const page:Page=await context.newPage();
  try {
    await page.goto(base+path,{waitUntil:'networkidle'});
    await page.getByText(ready,{exact:false}).first().waitFor({timeout:15000});
    const results=await new AxeBuilder({page}).analyze();
    return results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,help:v.help}));
  } finally {await context.close();}
}

const ROUTES:[string,string][]=[
  ['/control','Pair operator control'],
  ['/overlay','Pair read-only overlay'],
  ['/gallery','explicit compositions']
];

for(const [path,ready] of ROUTES) {
  test(`axe: ${path} has no serious or critical violations`,async()=>{
    const violations=await audit(path,ready);
    const serious=violations.filter(v=>v.impact==='serious'||v.impact==='critical');
    assert.deepEqual(serious,[],`${path}: ${JSON.stringify(serious)}`);
  });
}
