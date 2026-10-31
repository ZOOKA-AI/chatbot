/** Lead statuses are shared by the server queries, the API routes and the UI. */
export const LEAD_STATUSES = [
  "new",
  "qualified",
  "booked",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
