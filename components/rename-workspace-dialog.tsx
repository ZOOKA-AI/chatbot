"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { copy } from "@/lib/copy";
import { WORKSPACE_NAME_MAX, WORKSPACE_NAME_MIN } from "@/lib/workspace-name";

export function RenameWorkspaceDialog({
  open,
  onOpenChange,
  currentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
}) {
  const { lang } = useBilling();
  const t = copy[lang];
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
    }
  }, [open, currentName]);

  const trimmed = name.trim();
  const isValid =
    trimmed.length >= WORKSPACE_NAME_MIN &&
    trimmed.length <= WORKSPACE_NAME_MAX;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        throw new Error(t.renameFailed);
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      toast({ type: "error", description: t.renameFailed });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t.renameTitle}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label={t.renamePlaceholder}
            autoFocus
            maxLength={WORKSPACE_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.renamePlaceholder}
            value={name}
          />
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t.cancel}
            </Button>
            <Button disabled={!isValid || pending} type="submit">
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
