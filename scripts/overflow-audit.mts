import {createServer,type ViteDevServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

// Live rendered overflow audit: loads the 40-composition gallery in real
// Chromium (fonts loaded, FitText measured) and reports any element whose
// rendered box escapes its region section or the canvas.
// Intentionally scrolling/bleeding decor is excluded via IGNORE.
const IGNORE='.mm-ticker-track,.mm-orb,.mm-sweep,.mm-layer,.mm-grain,.mm-beacon,.mm-clash';
const TOL=1.5;

const vite:ViteDevServer=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'silent'});
await vite.listen();
const addr=vite.httpServer?.address();
assert.ok(addr&&typeof addr==='object');
const base=`http://127.0.0.1:${addr.port}`;
const browser=await chromium.launch();
try {
  const page=await (await browser.newContext()).newPage();
  await page.goto(base+'/gallery',{waitUntil:'networkidle'});
  await page.getByText('explicit compositions').waitFor({timeout:15000});
  const problems:string[]=[];
  for(let kind=0;kind<3;kind++) {
    await page.selectOption('select',String(kind));
    await page.waitForTimeout(500);
    const issues:string[]=await page.evaluate(`(ignore=>{const out=[];const TOL=1.5;
      const over=(r,b)=>r.left<b.left-TOL||r.top<b.top-TOL||r.right>b.right+TOL||r.bottom>b.bottom+TOL;
      document.querySelectorAll('.gallery .broadcast').forEach(art=>{
        const label=art.getAttribute('aria-label')||'?';
        const a=art.getBoundingClientRect();
        art.querySelectorAll('section[data-region]').forEach(sec=>{
          const role=sec.dataset.region||'?';const s=sec.getBoundingClientRect();
          if(over(s,a))out.push(label+' :: '+role+' section escapes canvas');
          sec.querySelectorAll('*').forEach(el=>{
            if(el.matches(ignore)||el.closest(ignore))return;
            const r=el.getBoundingClientRect();
            if(r.width<2||r.height<2)return;
            if(over(r,s))out.push(label+' :: '+role+' <'+el.tagName.toLowerCase()+'.'+String(el.className).split(' ')[0]+'> overflows region by L'+Math.round(s.left-r.left)+' T'+Math.round(s.top-r.top)+' R'+Math.round(r.right-s.right)+' B'+Math.round(r.bottom-s.bottom));
          });
        });
      });
      return out;})(${JSON.stringify(IGNORE)})`);
    problems.push(...issues);
  }
  if(problems.length){console.log(`OVERFLOW ISSUES (${problems.length}):`);for(const p of problems)console.log(' -',p);process.exitCode=1;}
  else console.log('OK: no rendered overflow across all compositions x3 fixture kinds');
} finally {await browser.close();await vite.close();}
