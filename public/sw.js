// Service worker: shows push notifications and opens the right page when one is tapped.
// It caches nothing, so it never serves stale or private pages.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Nation Desk", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever open pages of this site.
  let target = new URL("/", self.location.origin);
  try {
    const wanted = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          if ("navigate" in w) w.navigate(target.href).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
