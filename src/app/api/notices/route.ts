import { getCurrentUser } from "@/lib/auth/session";
import { unreadNotices } from "@/lib/notify";

/** Unread in-app notifications for the signed-in person (polled by the pop-ups while the app is open). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ notices: [] }, { status: 401 });
  const notices = await unreadNotices(user.id);
  return Response.json({ notices }, { headers: { "Cache-Control": "private, no-store" } });
}
