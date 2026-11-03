import { createAuthClient } from "better-auth/react";

/**
 * Browser auth client. The base URL is this origin, so the HttpOnly session
 * cookie stays first-party. The server owns the extra phone field; the sign-up
 * form supplies it where needed.
 */
export const authClient = createAuthClient();
