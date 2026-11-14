import { expect, test, vi } from "vitest";
const redirect = vi.hoisted(() => vi.fn(() => { throw new Error("redirected"); }));
vi.mock("next/navigation", () => ({ redirect }));
import Page from "@/app/chatbot/page";
test("chatbot is only a redirect to the existing session-protected workspace agent", () => {
  expect(() => Page()).toThrow("redirected");
  expect(redirect).toHaveBeenCalledWith("/workspace/agent");
});
