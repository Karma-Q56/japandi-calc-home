import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/server/auth";

/**
 * Browser auth client. The base URL is this origin, so the HttpOnly session
 * cookie stays first-party. The type import is erased at build time.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
