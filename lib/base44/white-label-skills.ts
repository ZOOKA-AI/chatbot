/**
 * The skills every app built on ZOOKA-AI should follow.
 *
 * Base44 loads a skill when its description matches the build in front of it,
 * so each description is written as a trigger ("Use when ...") rather than a
 * title. The instructions say only what is true of our own platform: they are
 * read by the builder agent, not by a person.
 */

import type { NewWorkspaceSkill } from "./white-label";

export const ZOOKA_WHITE_LABEL_SKILLS: NewWorkspaceSkill[] = [
  {
    name: "zooka-workspace-identity",
    description:
      "Use when an app needs to know who is signed in, or shows anything belonging to one person or one workspace.",
    body: [
      "Apps open inside ZOOKA-AI already signed in. Read the person from the app's signed-in user and never build a sign-in, sign-up or password screen.",
      "Every record belongs to one workspace. Scope every query to the workspace and never show a record from another one.",
      "Workspace roles are owner, admin and member. Show management tools to owner and admin only, and enforce the same rule on the server, not only in the interface.",
      "Call the tenant a workspace (مساحة عمل), never an organization or an account.",
    ].join("\n"),
  },
  {
    name: "zooka-plans-and-usage",
    description:
      "Use when an app shows a plan, a limit, a usage counter, or an upgrade prompt.",
    body: [
      "Read the plan and its limits from the platform: plan, messagesLimit and canUseAgentMode. Never hard-code a price, a limit or a usage number.",
      "Show usage as used out of the limit, from real data. When a number is missing, show a dash and say it is unavailable instead of inventing one.",
      "Tie a feature's availability to the entitlement flag the server returns, and hide or disable the action with a short line saying what the plan includes.",
      "Never state a price, a discount or a free tier the platform does not return.",
    ].join("\n"),
  },
  {
    name: "zooka-agent-api",
    description:
      "Use when an app needs to run the ZOOKA-AI agent, send it a prompt, or show its reply.",
    body: [
      "Call the agent from the server only, inside a backend function or an API route. No key ever reaches the browser.",
      "Read the key and the agent's app id from the server environment (BASE44_AGENT_API_KEY and BASE44_AGENT_APP_ID). Never write either into source.",
      "Render the agent's reply as text, never as raw HTML.",
      "On failure show the real state of the call, and never invent a reply or a tool result.",
      "Count usage per person and per workspace, one turn per message.",
    ].join("\n"),
  },
];
