"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Lang } from "@/lib/i18n";

export function DeleteAccountButton({ lang }: { lang: Lang }) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const ar = lang === "ar";

  async function deleteAccount() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(
          result.error ??
            (ar ? "تعذّر حذف الحساب. حاول مرة أخرى." : "Account deletion failed.")
        );
        setPending(false);
        return;
      }
      await signOut({ redirect: false });
      router.replace("/login");
    } catch {
      setError(
        ar
          ? "تعذّر الاتصال بالخدمة. لم يتم تأكيد حذف الحساب."
          : "Could not reach the service. Account deletion was not confirmed."
      );
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation("");
            setError("");
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            {ar ? "حذف الحساب والبيانات" : "Delete account and data"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent dir={ar ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ar ? "تأكيد حذف الحساب نهائياً" : "Permanently delete your account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ar
                ? "سيُحذف حسابك ومحادثاتك وملفاتك وبيانات الاستخدام. لا يمكن التراجع عن هذا الإجراء. لن تُحذف مساحة عمل فيها أعضاء آخرون، ولن يُحذف حساب باشتراك نشط."
                : "Your account, chats, files, and usage data will be deleted. This cannot be undone. Workspaces with other members and active subscriptions are protected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex flex-col gap-2 text-sm">
            {ar
              ? "اكتب DELETE للتأكيد"
              : "Type DELETE to confirm"}
            <input
              autoComplete="off"
              className="rounded-md border bg-background px-3 py-2"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {ar ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || confirmation !== "DELETE"}
              onClick={(event) => {
                event.preventDefault();
                void deleteAccount();
              }}
            >
              {pending
                ? ar
                  ? "جارٍ الحذف..."
                  : "Deleting..."
                : ar
                  ? "حذف نهائي"
                  : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
