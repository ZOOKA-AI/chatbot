import assert from "node:assert/strict";
import { test } from "vitest";
import { getGoogleDriveCallbackFeedback } from "@/lib/integrations/google-drive/callback-feedback";
import { isRevokedGoogleDriveGrant } from "@/lib/integrations/google-drive/token-response";

test("only an invalid_grant refresh failure marks a Drive grant revoked", () => {
  assert.equal(isRevokedGoogleDriveGrant("invalid_grant"), true);
  assert.equal(isRevokedGoogleDriveGrant("invalid_client"), false);
  assert.equal(isRevokedGoogleDriveGrant("invalid_scope"), false);
  assert.equal(isRevokedGoogleDriveGrant(undefined), false);
});

test("Google Drive callback feedback is localized and ignores unknown values", () => {
  assert.match(getGoogleDriveCallbackFeedback("error", "ar") ?? "", /OAuth/);
  assert.match(
    getGoogleDriveCallbackFeedback("cancelled", "en") ?? "",
    /cancelled/
  );
  assert.equal(getGoogleDriveCallbackFeedback("unexpected", "en"), null);
});
