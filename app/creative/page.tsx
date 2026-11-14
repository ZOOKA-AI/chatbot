import type { Metadata } from "next";
import { DesignStudio } from "@/components/creative/design-studio";
export const metadata: Metadata = {
  title: "ZOOKA AI Creative Studio",
  description:
    "Layer-based design editor, local templates and optional AI image generation.",
};
export default function Page() {
  return <DesignStudio />;
}
