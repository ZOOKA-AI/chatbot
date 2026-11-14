import {expect,test} from "@playwright/test";
test("MVP start links reach real existing tools and disabled vault cannot accept secrets",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("zooka-cookie-consent","rejected"));
 await page.goto("/start");await expect(page.getByRole("heading",{level:1})).toContainText("ZOOKA AI");
 for(const href of ["/register","/login","/workspace","/creative","/command-center","/private-library"]){await expect(page.locator(`a[href="${href}"]`)).toBeVisible();}
 await page.locator('a[href="/private-library"]').click();await expect(page.getByRole("status")).toContainText("STORAGE DISABLED");await expect(page.locator("input,textarea")).toHaveCount(0);await expect(page.getByRole("button",{name:/إضافة سر/})).toBeDisabled();await expect(page.getByRole("button",{name:/إضافة محتوى/})).toBeDisabled();
});
