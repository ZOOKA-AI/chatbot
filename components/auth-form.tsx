import Form from "next/form";

import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  labels,
  emailPlaceholder = "user@acme.com",
  passwordAutoComplete = "current-password",
  passwordMinLength,
  passwordHint,
  passwordHintId,
  onPasswordChange,
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  labels?: { email: string; password: string };
  emailPlaceholder?: string;
  passwordAutoComplete?: "current-password" | "new-password";
  /** Only for choosing a new password; sign-in accepts older, shorter ones. */
  passwordMinLength?: number;
  /** Rendered under the password field (e.g. a strength meter). */
  passwordHint?: React.ReactNode;
  passwordHintId?: string;
  onPasswordChange?: (value: string) => void;
}) {
  const emailLabel = labels?.email ?? "Email Address";
  const passwordLabel = labels?.password ?? "Password";

  return (
    <Form action={action} className="flex flex-col gap-4 px-5 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label
          className="font-normal text-zinc-600 dark:text-zinc-400"
          htmlFor="email"
        >
          {emailLabel}
        </Label>

        <Input
          autoComplete="email"
          autoFocus
          className="h-12 bg-muted text-base md:h-11 md:text-sm"
          defaultValue={defaultEmail}
          dir="ltr"
          id="email"
          inputMode="email"
          name="email"
          placeholder={emailPlaceholder}
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label
          className="font-normal text-zinc-600 dark:text-zinc-400"
          htmlFor="password"
        >
          {passwordLabel}
        </Label>

        <Input
          className="h-12 bg-muted text-base md:h-11 md:text-sm"
          aria-describedby={passwordHintId}
          autoComplete={passwordAutoComplete}
          dir="ltr"
          id="password"
          minLength={passwordMinLength}
          name="password"
          onChange={
            onPasswordChange ? (event) => onPasswordChange(event.target.value) : undefined
          }
          required
          type="password"
        />
        {passwordHint}
      </div>

      {children}
    </Form>
  );
}
