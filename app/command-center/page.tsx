import type { Metadata } from "next";
import { CommandCenter } from "@/components/operations/command-center";
export const metadata: Metadata = {
  title: "ZOOKA Command Center",
  robots: { index: false, follow: false },
};
/** Public command/help shell. All evidence and history require server-side RBAC. */
export default function Page() {
  return <CommandCenter />;
}
