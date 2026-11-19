import { redirect } from "next/navigation";

import { ScheduleConsole } from "@/components/schedule-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export default async function WorkspaceSchedulesPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  // The page decides what to show; the API decides what is allowed. A member sees the
  // schedules and their history, and the write controls are absent rather than refused.
  const canManage = ["owner", "admin"].includes(String(context.role));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">Scheduled tasks</h1>
        <p className="text-sm opacity-70">
          A schedule creates one task per due slot on the existing scheduler. Times are in each schedule&apos;s own
          timezone.
        </p>
      </header>
      <ScheduleConsole canManage={canManage} />
    </main>
  );
}
