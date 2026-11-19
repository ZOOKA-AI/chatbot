import { chromium } from "playwright";
const B="https://localhost:3444";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const page=await c.newPage(); await page.goto(B+"/pricing",{waitUntil:"domcontentloaded"}); await page.waitForTimeout(900);
const out=await page.evaluate(()=>[...document.querySelectorAll("button")]
  .filter(el=>el.offsetParent!==null)
  .filter(el=>!(el.getAttribute("aria-label")||el.textContent||"").trim())
  .map(el=>({cls:el.className.slice(0,80), parent:el.parentElement?.className.slice(0,100), gp:el.parentElement?.parentElement?.className.slice(0,100), svg:el.querySelector("svg")?.outerHTML.slice(0,120)})));
console.log(JSON.stringify(out,null,1).slice(0,1600));
await b.close();
