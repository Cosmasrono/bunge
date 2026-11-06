import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { signupOpen } from "@/lib/auth/invite";
import { getCurrentUser, IDLE_MS } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const n = await getDb().user.count();
  if (n === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { next, idle } = await searchParams;
  const idleMinutes = Math.round(IDLE_MS / 60_000);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-[15px] text-muted">Sign in to see your schedule.</p>
      {idle && (
        <p role="status" className="mt-5 rounded-xl bg-warning-soft px-3.5 py-3 text-sm text-warning">
          You were signed out after {idleMinutes >= 60 && idleMinutes % 60 === 0 ? `${idleMinutes / 60} ${idleMinutes === 60 ? "hour" : "hours"}` : `${idleMinutes} minutes`} without activity, to keep your account safe. Sign in again to continue.
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : "/"} />
      <p className="mt-8 text-center text-sm text-muted">
        {signupOpen() ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          "Accounts are created by your administrator. Check your email for an invitation."
        )}
      </p>
    </>
  );
}
