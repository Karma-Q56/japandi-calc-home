import { describe, expect, it, vi } from "vitest";
import { enableBrowserPush } from "./web-push-client";

describe("browser push setup", () => {
  it("fails closed without browser push APIs", async () => {
    await expect(enableBrowserPush("AQID")).rejects.toThrow(/does not support web push/);
  });

  it("does not ask for permission before VAPID is configured", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", { PushManager: class {} });
    vi.stubGlobal("Notification", { requestPermission });
    vi.stubGlobal("document", {});
    await expect(enableBrowserPush("")).rejects.toThrow(/VAPID public key/);
    expect(requestPermission).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
