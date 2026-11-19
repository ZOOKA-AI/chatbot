import { motion } from "framer-motion";
import { AdShowcase } from "@/components/ad-showcase";
import { BuildSection } from "@/components/build-section";
import { Globe3D } from "@/components/globe-3d";
import { IntegrationOrbit } from "@/components/integration-orbit";
import { SiteFooter } from "@/components/site-footer";

/**
 * Empty-chat home. Compact on top (so the conversation keeps the space), and
 * the "website" part — sponsor showcase and footer — sits at the very end of
 * the scroll, never between the user and the composer.
 */
export const Greeting = ({
  lang = "ar",
  onSelectPrompt,
}: {
  lang?: "ar" | "en";
  onSelectPrompt?: (prompt: string) => void;
}) => {
  const ar = lang === "ar";
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 md:px-8"
      dir={ar ? "rtl" : "ltr"}
      key="overview"
    >
      <div className="flex min-h-[46dvh] w-full flex-col items-center justify-center pt-4 md:pt-10">
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="zk-neon-orb relative mb-2 flex items-center justify-center"
          exit={{ opacity: 0, scale: 0.96 }}
          initial={{ opacity: 0, scale: 0.96 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <IntegrationOrbit size={104} />
          </div>
          <Globe3D size={96} />
        </motion.div>
        <motion.h1
          animate={{ opacity: 1, y: 0 }}
          className="zk-neon-text text-center font-bold text-2xl tracking-tight md:text-3xl"
          exit={{ opacity: 0, y: 10 }}
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.35 }}
        >
          {ar ? "أهلاً بك في زوكا" : "Welcome to Zooka"}
        </motion.h1>
        <motion.p
          animate={{ opacity: 1, y: 0 }}
          className="mt-1 text-center text-base text-muted-foreground md:text-lg"
          exit={{ opacity: 0, y: 10 }}
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.45 }}
        >
          {ar
            ? "اكتب طلبك، أو اختر ما تريد بناءه."
            : "Type your request, or pick what to build."}
        </motion.p>
        {onSelectPrompt && (
          <BuildSection lang={lang} onSelectPrompt={onSelectPrompt} />
        )}
      </div>

      <div className="mt-16 w-full" data-testid="home-site-section">
        <AdShowcase lang={lang} />
        <SiteFooter embedded lang={lang} year={new Date().getFullYear()} />
      </div>
    </div>
  );
};
