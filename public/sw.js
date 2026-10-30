self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "You have a new update." };
  }
  const title = typeof payload.title === "string" ? payload.title : "Patron";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "You have a new update.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: typeof payload.url === "string" ? payload.url : "/me" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/me", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      return existing ? existing.navigate(target).then(() => existing.focus()) : self.clients.openWindow(target);
    }),
  );
});
