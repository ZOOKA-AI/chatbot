import { DEFAULT_WORKSPACE_NAMES } from "@/lib/copy";
import type { Lang } from "@/lib/i18n";

export const WORKSPACE_NAME_MIN = 2;
export const WORKSPACE_NAME_MAX = 80;

// Matches machine generated identifiers such as "1792738151875" or
// "guest-1792738151875's workspace" that must never be shown to users.
const PLACEHOLDER_NAME = /^(guest-?)?\d{6,}('s workspace)?$/i;

export function isPlaceholderWorkspaceName(name: string) {
  return PLACEHOLDER_NAME.test(name.trim());
}

export function displayWorkspaceName(name: string | undefined, lang: Lang) {
  if (!name || isPlaceholderWorkspaceName(name)) {
    return DEFAULT_WORKSPACE_NAMES[lang];
  }
  return name;
}

export function defaultWorkspaceNameForEmail(email: string) {
  const localPart = email.split("@")[0];
  if (!localPart || isPlaceholderWorkspaceName(localPart)) {
    return DEFAULT_WORKSPACE_NAMES.ar;
  }
  return `${localPart}'s workspace`;
}
