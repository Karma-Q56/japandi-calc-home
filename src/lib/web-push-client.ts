export interface BrowserPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

function decodeBase64Url(value: string): ArrayBuffer {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

export async function enableBrowserPush(publicKey: string): Promise<BrowserPushSubscription> {
  if (!publicKey) throw new Error("Push is not configured yet: add the VAPID public key to this build.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("This browser does not support web push notifications.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(publicKey),
  });
  const json = subscription.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("The browser returned an incomplete push subscription.");
  }
  return { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh, auth } };
}

export async function disableBrowserPush(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}

export async function showLocalPushTest(): Promise<void> {
  if (!("serviceWorker" in navigator) || Notification.permission !== "granted") {
    throw new Error("Enable notifications first.");
  }
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification("Patron test notification", {
    body: "Notifications are enabled for this device.",
    icon: "/favicon.svg",
    data: { url: "/me/settings#messages" },
  });
}
