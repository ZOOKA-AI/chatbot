import { GET as authGet, POST as authPost } from "@/app/(auth)/auth";
import { withGoogleTransactionCookies } from "@/lib/auth/google-transaction";

export const GET = withGoogleTransactionCookies(authGet);
export const POST = withGoogleTransactionCookies(authPost);
