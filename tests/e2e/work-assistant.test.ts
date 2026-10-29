import { expect, test } from "@playwright/test";
import { getWorkAssistantProgress } from "@/lib/ai/work-assistant-progress";
import type { ChatMessage } from "@/lib/types";

test("work assistant presets are shown with the plan gate intact", async ({
  page,
}) => {
  await page.goto("/?mode=work");

  await expect(page.getByTestId("work-assistant-overview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ابدأ بمهمة" })).toBeVisible();
  await expect(page.getByTestId("work-assistant-preset-0")).toBeDisabled();
  await expect(
    page.getByText("يتطلب مساعد العمل خطة Pro أو Business")
  ).toBeVisible();
});

test("work assistant progress reflects real tool outcomes", () => {
  const message = {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "tool-searchGoogleDrive",
        toolCallId: "tool-1",
        state: "output-available",
        input: { query: "report" },
        output: { files: [], warning: "untrusted" },
      },
      {
        type: "tool-readGoogleDriveFile",
        toolCallId: "tool-2",
        state: "output-available",
        input: { fileId: "file-123456789" },
        output: { error: "File could not be read." },
      },
    ],
  } as unknown as ChatMessage;

  expect(
    getWorkAssistantProgress({
      messages: [message],
      status: "ready",
      lang: "en",
    })
  ).toBe(
    "The response is complete. Tool results: 1; tool errors: 1. Review the actual results above."
  );
});

test("work assistant does not imply a tool-verified result without tools", () => {
  const message = {
    id: "assistant-2",
    role: "assistant",
    parts: [{ type: "text", text: "A model answer." }],
  } as unknown as ChatMessage;

  expect(
    getWorkAssistantProgress({
      messages: [message],
      status: "ready",
      lang: "en",
    })
  ).toContain("has not been checked against external sources");
});

test("work assistant summary counts only the latest task", () => {
  const messages = [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Earlier task" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-searchGoogleDrive",
          toolCallId: "tool-1",
          state: "output-available",
          input: { query: "report" },
          output: { files: [], warning: "untrusted" },
        },
      ],
    },
    {
      id: "user-2",
      role: "user",
      parts: [{ type: "text", text: "Current task" }],
    },
    {
      id: "assistant-2",
      role: "assistant",
      parts: [
        {
          type: "tool-readGoogleDriveFile",
          toolCallId: "tool-2",
          state: "output-available",
          input: { fileId: "file-123456789" },
          output: { error: "File could not be read." },
        },
      ],
    },
  ] as unknown as ChatMessage[];

  expect(
    getWorkAssistantProgress({
      messages,
      status: "ready",
      lang: "en",
    })
  ).toBe(
    "The response is complete. Tool results: 0; tool errors: 1. Review the actual results above."
  );
});
