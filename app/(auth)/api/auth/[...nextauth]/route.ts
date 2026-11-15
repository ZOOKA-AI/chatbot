import { GET, POST as authPOST } from "@/app/(auth)/auth";
import { withCredentialThrottle } from "@/lib/auth/credential-throttle-route";
import { getThrottleStore } from "@/lib/auth/throttle";

export { GET };

// 429 + Retry-After for a locked caller of the credentials callback; every other
// request reaches the NextAuth handler unchanged.
export const POST = withCredentialThrottle(authPOST, getThrottleStore);
