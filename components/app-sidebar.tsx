"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import {
  Bot,
  BriefcaseBusiness,
  Cable,
  CreditCard,
  FileText,
  Settings,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { useBilling } from "@/components/billing-provider";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { ManageAccountButton } from "@/components/manage-account-button";
import { RenameWorkspaceDialog } from "@/components/rename-workspace-dialog";
import {
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { UpgradeButton } from "@/components/upgrade-button";
import { copy } from "@/lib/copy";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function AppSidebar({
  user,
  workspaceName,
  role,
  isGuest,
}: {
  user: User | undefined;
  workspaceName?: string;
  role?: "owner" | "admin" | "member";
  isGuest?: boolean;
}) {
  const { lang, canUseAgentMode, hasAgentPlan, agentRunsRemaining } =
    useBilling();
  const t = copy[lang];
  const isArabic = lang === "ar";
  const canRename = role === "owner" || role === "admin";
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { mutate } = useSWRConfig();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const workAssistantHref = canUseAgentMode
    ? "/?mode=work"
    : isGuest
      ? "/pricing"
      : "/workspace/billing";
  const navigationSections = [
    {
      label: isArabic ? "الوكلاء" : "Agents",
      items: [
        {
          href: "/",
          icon: <Bot />,
          label: isArabic ? "الدردشة والنماذج" : "Chat and models",
        },
      ],
    },
    {
      label: isArabic ? "العمل" : "Work",
      items: [
        {
          href: workAssistantHref,
          icon: <BriefcaseBusiness />,
          label: isArabic ? "مساعد العمل" : "Work assistant",
          title: canUseAgentMode
            ? isArabic
              ? `متبقي ${agentRunsRemaining.toLocaleString(lang)} من تشغيلات الوكيل هذا الشهر.`
              : `${agentRunsRemaining.toLocaleString(lang)} agent runs remaining this month.`
            : hasAgentPlan
              ? isArabic
                ? "تم بلوغ الحد الشهري لتشغيلات الوكيل. راجع الباقة والاستخدام."
                : "Monthly agent run limit reached. See Plan and usage."
              : isArabic
                ? "يتطلب مساعد العمل خطة Pro أو Business."
                : "Work assistant requires a Pro or Business plan.",
        },
        {
          href: "/settings/integrations",
          icon: <Cable />,
          label: isArabic ? "التكاملات" : "Integrations",
        },
      ],
    },
    {
      label: isArabic ? "مساحة العمل" : "Workspace",
      items: [
        {
          href: "/",
          icon: <FileText />,
          label: isArabic ? "المحادثات والمحتوى" : "Chats and content",
        },
        {
          href: "/workspace",
          icon: <Settings />,
          label: t.workspaceSettings,
        },
        {
          href: "/workspace/billing",
          icon: <CreditCard />,
          label: isArabic ? "الباقة والاستخدام" : "Plan and usage",
        },
        {
          href: "/settings/account",
          icon: <UserRound />,
          label: isArabic ? "الحساب" : "Account",
        },
      ],
    },
  ];

  const handleDeleteAll = () => {
    const deletePromise = fetch("/api/history", {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: "Deleting all chats...",
      success: () => {
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        setShowDeleteAllDialog(false);
        router.replace("/");
        router.refresh();
        return "All chats deleted successfully";
      },
      error: "Failed to delete all chats",
    });
  };

  return (
    <>
      <Sidebar className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <SidebarMenu>
            <div className="flex flex-row items-center justify-between">
              <Link
                className="flex flex-row items-center gap-3"
                href="/"
                onClick={() => {
                  setOpenMobile(false);
                }}
              >
                <span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
                  Chatbot
                </span>
              </Link>
              <div className="flex flex-row gap-1">
                {user && (role === "owner" || role === "admin") && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="h-8 p-1 md:h-fit md:p-2"
                        onClick={() => setShowDeleteAllDialog(true)}
                        type="button"
                        variant="ghost"
                      >
                        <TrashIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent align="end" className="hidden md:block">
                      Delete All Chats
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 p-1 md:h-fit md:p-2"
                      onClick={() => {
                        setOpenMobile(false);
                        router.push("/");
                        router.refresh();
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <PlusIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent align="end" className="hidden md:block">
                    New Chat
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {user && (
            <div className="mx-2 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p
                  className="truncate font-medium"
                  data-testid="workspace-name"
                >
                  {workspaceName}
                </p>
                {canRename && (
                  <button
                    aria-label={t.rename}
                    className="shrink-0 text-muted-foreground text-xs underline"
                    data-testid="rename-workspace"
                    onClick={() => setShowRenameDialog(true)}
                    type="button"
                  >
                    {t.rename}
                  </button>
                )}
              </div>
            </div>
          )}
          <nav
            aria-label={isArabic ? "التنقل الرئيسي" : "Main navigation"}
            className="flex flex-col"
          >
            {navigationSections.map((section) => (
              <SidebarGroup key={section.label}>
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.href + item.label}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.label}
                        >
                          <Link
                            href={item.href}
                            onClick={() => setOpenMobile(false)}
                            title={"title" in item ? item.title : undefined}
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
          <div className="mx-2 flex flex-col gap-2">
            <UpgradeButton
              className="w-full"
              onNavigate={() => setOpenMobile(false)}
            />
            <ManageAccountButton className="w-full" />
          </div>
          <SidebarHistory user={user} />
        </SidebarContent>
        <SidebarFooter>
          {user && !isGuest && <SidebarUserNav user={user} />}
          {isGuest && (
            <div className="flex flex-col gap-2">
              <p className="text-center text-muted-foreground text-xs">
                {t.guestNotice}
              </p>
              <Button asChild size="sm">
                <Link href="/register">{t.signUp}</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/login">{t.logIn}</Link>
              </Button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      {workspaceName && (
        <RenameWorkspaceDialog
          currentName={workspaceName}
          onOpenChange={setShowRenameDialog}
          open={showRenameDialog}
        />
      )}

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
