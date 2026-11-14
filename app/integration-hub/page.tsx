import type { Metadata } from "next";
import { IntegrationHub } from "@/components/creative/integration-hub";
export const metadata: Metadata = {
  title: "ZOOKA Integration Hub",
  description: "Explicit credential state and opt-in provider verification.",
};
export default function Page() {
  return <IntegrationHub />;
}
