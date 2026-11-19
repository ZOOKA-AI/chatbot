import { chromium } from "playwright";
const B="https://localhost:3444";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const page=await c.newPage(); await page.goto(B+"/login",{waitUntil:"domcontentloaded"}); await page.waitForTimeout(900);
const out=await page.evaluate(()=>{
  const el=[...document.querySelectorAll("a,button")].filter(e=>e.offsetParent!==null)
   .find(e=>!(e.getAttribute("aria-label")||e.textContent||e.getAttribute("title")||"").trim());
  if(!el) return null;
  return {html:el.outerHTML.replace(/\s+/g," ").slice(0,300), text:JSON.stringify(el.textContent), kid:el.children.length};
});
console.log(JSON.stringify(out));
await b.close();
