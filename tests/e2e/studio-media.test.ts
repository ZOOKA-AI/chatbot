import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top === window)
      localStorage.setItem("zooka-cookie-consent", "rejected");
  });
});

test("command search navigates to media with keyboard and Escape closes it", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "بحث وتنقل سريع" }).click();
  await page.getByRole("searchbox", { name: "ابحث عن قسم" }).fill("الصوت");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "الصوت وتسجيل الشاشة", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "اذهب مباشرة إلى…" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("voice draft permits manual text and downloads without network transcription", async ({
  page,
}) => {
  await page.goto("/studio/media");
  await expect(
    page.getByRole("button", { name: "ابدأ الإملاء" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "نص دفتر الصوت" })
    .fill("هذه ملاحظة للمراجعة فقط");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "تنزيل النص" }).click();
  expect((await download).suggestedFilename()).toBe("zooka-voice-note.txt");
  await expect(page.getByText(/هذه ليست مكالمة مباشرة/)).toBeVisible();
});

test("screen permission rejection never produces a fake recording", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.goto("/studio/media");
  await page.getByRole("button", { name: "ابدأ تسجيل الشاشة" }).click();
  await expect(page.getByRole("status")).toContainText("لم يبدأ التسجيل");
  await expect(page.getByRole("link", { name: "تنزيل التسجيل" })).toHaveCount(
    0,
  );
});

test("recording lifecycle uses actual MediaRecorder with a synthetic test stream", async ({
  page,
}) => {
  // Test-only generated video; not a real OS screen chooser or hardware test.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");
        let n = 0;
        const timer = window.setInterval(() => {
          if (ctx) {
            ctx.fillStyle = n++ % 2 ? "green" : "blue";
            ctx.fillRect(0, 0, 320, 180);
          }
        }, 50);
        const stream = canvas.captureStream(10);
        stream.getTracks().forEach((track) => {
          const stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
          };
        });
        return stream;
      },
    });
  });
  await page.goto("/studio/media");
  await page.getByRole("button", { name: "ابدأ تسجيل الشاشة" }).click();
  await expect(
    page.getByRole("button", { name: "إيقاف مؤقت", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
  await page.getByRole("button", { name: "استئناف", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "إيقاف وإنشاء الملف" }).click();
  const link = page.getByRole("link", { name: "تنزيل التسجيل" });
  await expect(link).toBeVisible();
  const downloading = page.waitForEvent("download");
  await link.click();
  expect((await downloading).suggestedFilename()).toMatch(
    /^zooka-screen\.(webm|mp4)$/,
  );
  await page.getByRole("button", { name: "حذف التسجيل" }).click();
  await expect(link).toHaveCount(0);
});

test("agent planner creates a reviewable draft without executing any tool", async ({
  page,
}) => {
  await page.goto("/studio/agent");
  await page
    .getByLabel("هدف المهمة", { exact: true })
    .fill("تنظيم إطلاق موقعي");
  await page.getByLabel("السياق والقيود").fill("دون نشر أو دفع");
  await page.getByRole("button", { name: "إعداد الطلب للمراجعة" }).click();
  await expect(
    page.getByRole("textbox", { name: "مسودة طلب الوكيل" }),
  ).toContainText("تنظيم إطلاق موقعي");
  await expect(page.getByRole("status")).toContainText("لم يبدأ أي وكيل");
});

test("same-origin permission policy allows requested mic/screen but not camera", async ({
  request,
}) => {
  const response = await request.get("/studio/media");
  const policy = response.headers()["permissions-policy"];
  expect(policy).toContain("microphone=(self)");
  expect(policy).toContain("display-capture=(self)");
  expect(policy).toContain("camera=()");
});

test("dictation writes a reviewable draft using a mocked recognition event", async ({
  page,
}) => {
  // Simulates browser callbacks only; does not validate a microphone or remote STT service.
  await page.addInitScript(() => {
    class MockRecognition {
      lang = "";
      continuous = true;
      interimResults = true;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onresult?.({
          results: [
            { isFinal: true, 0: { transcript: "مهمة من الصوت للمراجعة" } },
          ],
        });
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: MockRecognition,
    });
  });
  await page.goto("/studio/media");
  await page.getByRole("checkbox", { name: /أفهم معالجة الصوت/ }).check();
  await page.getByRole("button", { name: "ابدأ الإملاء" }).click();
  await page.getByRole("button", { name: "إيقاف الإملاء" }).click();
  await expect(
    page.getByRole("textbox", { name: "نص دفتر الصوت" }),
  ).toHaveValue("مهمة من الصوت للمراجعة");
});

test("unsupported screen capture is disabled rather than simulated", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/studio/media");
  await expect(
    page.getByRole("button", { name: "ابدأ تسجيل الشاشة" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/المتصفح لا يوفّر تسجيل الشاشة هنا/),
  ).toBeVisible();
});

test("leaving the media section stops all generated capture tracks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const stream = canvas.captureStream(5);
        (window as unknown as { testCapture: MediaStream }).testCapture =
          stream;
        return stream;
      },
    });
  });
  await page.goto("/studio/media");
  await page.getByRole("button", { name: "ابدأ تسجيل الشاشة" }).click();
  await expect(
    page.getByRole("button", { name: "إيقاف مؤقت", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "لوحة المهام", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "لوحة المهام", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testCapture: MediaStream }).testCapture
        .getTracks()
        .every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
});

test("extension slots are reserved without fake activation buttons", async ({
  page,
}) => {
  await page.goto("/studio/extensions");
  await expect(
    page.getByRole("heading", { name: "مساحة التطوير", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("مساحة محجوزة — غير مفعّل", { exact: true }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "تفعيل", exact: true }),
  ).toHaveCount(0);
});
