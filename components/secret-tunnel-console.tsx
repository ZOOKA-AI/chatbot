"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Binary, Bot, Gauge, Layers, Sparkles, Waypoints } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { type ComponentType, useEffect, useMemo, useState } from "react";

const COMPACT_COPY_KEY = "zooka_compact_copy";

type TunnelAction = {
  id: string;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
};

export function SecretTunnelConsole() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [compactCopy, setCompactCopy] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COMPACT_COPY_KEY) === "1";
    setCompactCopy(stored);
    document.documentElement.classList.toggle("zk-compact-copy", stored);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const actions = useMemo<TunnelAction[]>(
    () => [
      {
        id: "workspace-home",
        label: "Workspace Home",
        hint: "/workspace/home",
        icon: Layers,
        run: () => router.push("/workspace/home"),
      },
      {
        id: "chat",
        label: "Chat + Models",
        hint: "/",
        icon: Bot,
        run: () => router.push("/"),
      },
      {
        id: "studio",
        label: "Media Studio",
        hint: "/dashboard/studio",
        icon: Sparkles,
        run: () => router.push("/dashboard/studio"),
      },
      {
        id: "usage",
        label: "Usage + Limits",
        hint: "/settings/usage",
        icon: Gauge,
        run: () => router.push("/settings/usage"),
      },
      {
        id: "compact-copy",
        label: compactCopy ? "Reveal detailed text" : "Hide non-essential text",
        hint: "Compact copy mode",
        icon: Binary,
        run: () => {
          const next = !compactCopy;
          setCompactCopy(next);
          localStorage.setItem(COMPACT_COPY_KEY, next ? "1" : "0");
          document.documentElement.classList.toggle("zk-compact-copy", next);
        },
      },
    ],
    [compactCopy, router]
  );

  const themeLabel = theme === "system" ? `system (${resolvedTheme ?? "unknown"})` : (theme ?? "unknown");

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed bottom-24 left-3 z-50 md:bottom-6 md:left-6",
          pathname === "/" && "md:bottom-20"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Open tunnel console"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/40 bg-black/45 text-cyan-200 shadow-[0_0_20px_-6px_rgba(34,211,238,0.95)] backdrop-blur-md transition hover:border-cyan-300 hover:text-cyan-100"
              onClick={() => setOpen(true)}
              type="button"
            >
              <Waypoints className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Tunnel Console
          </TooltipContent>
        </Tooltip>
        <p className="mt-1 text-center text-[10px] text-cyan-200/80">Ctrl/⌘+K</p>
      </div>

      <CommandDialog onOpenChange={setOpen} open={open}>
        <CommandInput placeholder="Search routes, controls and hidden tunnels..." />
        <CommandList>
          <CommandEmpty>No actions found.</CommandEmpty>
          <CommandGroup heading="Tunnels">
            {actions.map((action) => (
              <CommandItem
                key={action.id}
                onSelect={() => {
                  action.run();
                  setOpen(false);
                }}
              >
                <action.icon className="h-4 w-4" />
                <span>{action.label}</span>
                <CommandShortcut>{action.hint}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Live diagnostics">
            <CommandItem disabled>
              <Layers className="h-4 w-4" />
              <span>Path: {pathname || "/"}</span>
            </CommandItem>
            <CommandItem disabled>
              <Sparkles className="h-4 w-4" />
              <span>Theme: {themeLabel}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
