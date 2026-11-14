import { redirect } from "next/navigation";

/** Stable entry point; the existing workspace agent still enforces its own session. */
export default function Page() {
  redirect("/workspace/agent");
}
