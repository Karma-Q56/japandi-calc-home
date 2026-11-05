import { authClient } from "@/lib/auth-client";
import { updateDemo } from "@/data/repo";

/** Clear the local demo identity without throwing away the demo venue data. */
export function clearDemoSession() {
  updateDemo((current) => ({
    ...current,
    session: { role: "guest" },
  }));
}

/**
 * Sign out of either mode and return to the public home page.
 * The live session is ended on the server; demo mode only clears this browser.
 */
export async function signOut(mode: "demo" | "live" = "demo") {
  if (mode === "live") {
    try {
      await authClient.signOut();
    } catch {
      // The local session still has to clear if the network is unavailable.
    }
  }
  clearDemoSession();
  if (typeof window !== "undefined") window.location.assign("/");
}
