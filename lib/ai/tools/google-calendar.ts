import { tool } from "ai";
import { z } from "zod";
import { getGoogleDriveAccessToken } from "@/lib/integrations/google-drive/server";

/**
 * Calendar tools: read a day and create one event. They ride on the existing
 * workspace Google connection, so a connection created before the calendar
 * scope was added must be reconnected once from Settings → Integrations.
 */

const CALENDAR_RECONNECT =
  "Calendar access is not granted for this workspace yet. Reconnect Google from Settings → Integrations and keep the calendar permission checked.";

const listInputSchema = z.object({
  from: z
    .string()
    .trim()
    .min(10)
    .max(64)
    .describe("Range start, ISO 8601, for example 2026-11-01T00:00:00Z."),
  to: z
    .string()
    .trim()
    .min(10)
    .max(64)
    .describe("Range end, ISO 8601, for example 2026-11-08T00:00:00Z."),
  maxResults: z.number().int().min(1).max(20).optional(),
});

const createInputSchema = z.object({
  summary: z.string().trim().min(2).max(200).describe("Event title."),
  start: z.string().trim().min(10).max(64).describe("Start, ISO 8601 with timezone, for example 2026-11-02T10:00:00+04:00."),
  end: z.string().trim().min(10).max(64).describe("End, ISO 8601 with the same timezone."),
  description: z.string().trim().max(2000).optional(),
  attendeeEmails: z
    .array(z.string().trim().email().max(320))
    .max(10)
    .optional()
    .describe("Optional guest emails. Invitations are sent by Google, not by the agent."),
});

const eventsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        summary: z.string().optional(),
        status: z.string().optional(),
        htmlLink: z.string().optional(),
        start: z.record(z.string(), z.string()).optional(),
        end: z.record(z.string(), z.string()).optional(),
        attendees: z
          .array(z.object({ email: z.string().optional() }))
          .optional(),
      })
    )
    .optional(),
});

async function calendarFetch(
  organizationId: string,
  path: string,
  init?: { method: string; body: unknown }
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const accessToken = await getGoogleDriveAccessToken(organizationId);
  if (!accessToken) {
    return { ok: false, error: CALENDAR_RECONNECT };
  }
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3${path}`,
    {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init ? { "Content-Type": "application/json" } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
    }
  );
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: CALENDAR_RECONNECT };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `Calendar request failed with status ${response.status}.`,
    };
  }
  return { ok: true, data: await response.json() };
}

/**
 * Calls the forming tool needs approval for. Exported so the chat route and
 * the tool-approval flow agree on the same list.
 */
export const GOOGLE_CALENDAR_WRITE_TOOLS = ["createCalendarEvent"] as const;

export function createCalendarTools(organizationId: string) {
  return {
    listCalendarEvents: tool({
      description:
        "List the workspace owner's calendar events in a time range. Read-only; use this before promising a slot or summarising the day.",
      inputSchema: listInputSchema,
      execute: async ({ from, to, maxResults }) => {
        const params = new URLSearchParams({
          timeMin: new Date(from).toISOString(),
          timeMax: new Date(to).toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: String(maxResults ?? 10),
        });
        const result = await calendarFetch(
          organizationId,
          `/calendars/primary/events?${params.toString()}`
        );
        if (!result.ok) {
          return { error: result.error };
        }
        const parsed = eventsSchema.safeParse(result.data);
        const items = parsed.success ? (parsed.data.items ?? []) : [];
        return {
          events: items.map((event) => ({
            id: event.id ?? null,
            title: event.summary ?? "(no title)",
            status: event.status ?? null,
            start: event.start?.dateTime ?? event.start?.date ?? null,
            end: event.end?.dateTime ?? event.end?.date ?? null,
            guests: (event.attendees ?? [])
              .map((attendee) => attendee.email)
              .filter(Boolean),
            link: event.htmlLink ?? null,
          })),
        };
      },
    }),
    createCalendarEvent: tool({
      description:
        "Create one calendar event on the workspace owner's primary calendar, optionally inviting guests. Confirm the exact time with the user before calling this.",
      inputSchema: createInputSchema,
      execute: async ({ summary, start, end, description, attendeeEmails }) => {
        const body: Record<string, unknown> = {
          summary,
          start: { dateTime: new Date(start).toISOString() },
          end: { dateTime: new Date(end).toISOString() },
        };
        if (description) {
          body.description = description;
        }
        if (attendeeEmails?.length) {
          body.attendees = attendeeEmails.map((email) => ({ email }));
        }
        const result = await calendarFetch(
          organizationId,
          "/calendars/primary/events?sendUpdates=all",
          { method: "POST", body }
        );
        if (!result.ok) {
          return { error: result.error };
        }
        const created = result.data as {
          id?: string;
          htmlLink?: string;
          summary?: string;
        };
        return {
          created: true,
          id: created.id ?? null,
          title: created.summary ?? summary,
          link: created.htmlLink ?? null,
          invited: attendeeEmails ?? [],
        };
      },
    }),
  };
}
