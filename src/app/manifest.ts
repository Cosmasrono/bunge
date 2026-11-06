import type { MetadataRoute } from "next";

// Lets the site be installed on a phone's home screen. On iPhone this is required for push notifications.
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.APP_NAME || "PRS";
  return {
    name,
    short_name: name,
    description: "Your schedule, with reminders by email and notification.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7a4527",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
