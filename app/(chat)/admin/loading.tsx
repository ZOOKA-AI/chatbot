import { OverviewSkeleton } from "./overview-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <OverviewSkeleton />
      <OverviewSkeleton />
    </div>
  );
}
