import { chromium } from "playwright";
const B="https://localhost:3444",E="rc-b-mwjc8sws@zooka-test.dev",P="Rc-Accept-2026!x7Qm";
const b=await chromium.launch({args:["--no-sandbox"]});const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
const csrf=(await(await c.request.get(B+"/api/auth/csrf")).json()).csrfToken;
await c.request.post(B+"/api/auth/callback/credentials",{form:{csrfToken:csrf,email:E,password:P,callbackUrl:B+"/"}});
for (const p of ["/","/login","/workspace/studio"]) {
  const page=await c.newPage(); await page.goto(B+p,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(900);
  const out=await page.evaluate(()=>{
    const ctrl=[...document.querySelectorAll("a,button")].filter(el=>el.offsetParent!==null)
      .filter(el=>!(el.getAttribute("aria-label")||el.textContent||el.getAttribute("title")||"").trim())
      .map(el=>({tag:el.tagName,name:el.getAttribute("name"),type:el.getAttribute("type"),svg:!!el.querySelector("svg"),parent:(el.parentElement?.className||"").slice(0,45)}));
    const inp=[...document.querySelectorAll("input,select,textarea")].filter(el=>el.offsetParent!==null)
      .filter(el=>{const id=el.getAttribute("id");return !(el.getAttribute("aria-label")||el.getAttribute("placeholder")||(id&&document.querySelector(`label[for="${id}"]`)));})
      .map(el=>({tag:el.tagName,type:el.getAttribute("type"),name:el.getAttribute("name"),id:el.getAttribute("id")}));
    return {ctrl,inp};});
  console.log(p, JSON.stringify(out).slice(0,700));
  await page.close();
}
await b.close();
