"use client";

import { useFormStatus } from "react-dom";

import { LoaderIcon } from "@/components/icons";

import { Button } from "./ui/button";

export function SubmitButton({
  children,
  isSuccessful,
}: {
  children: React.ReactNode;
  isSuccessful: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-busy={pending || isSuccessful}
      aria-disabled={pending || isSuccessful}
      className="relative h-12 w-full text-base md:h-11 md:text-sm"
      disabled={pending || isSuccessful}
      type={pending ? "button" : "submit"}
    >
      {children}

      {(pending || isSuccessful) && (
        <span aria-hidden="true" className="absolute end-4 animate-spin">
          <LoaderIcon />
        </span>
      )}

      <output aria-live="polite" className="sr-only">
        {pending || isSuccessful ? "…" : ""}
      </output>
    </Button>
  );
}
