import { LinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { findValidReset } from "@/lib/auth/reset";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const found = await findValidReset(token);
  if (!found) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <LinkIcon className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">This link has expired</h1>
        <p className="mt-2 text-[15px] text-muted">
          Links work once and expire after a while. If you were invited, ask your admin to send the invitation again. Otherwise you can request a new reset link.
        </p>
        <Link href="/forgot" className="btn-primary mt-8 w-full">
          Send a new link
        </Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {found.purpose === "invite" ? `Welcome, ${found.name.split(" ")[0]}` : "Choose a new password"}
      </h1>
      <p className="mt-1.5 text-[15px] text-muted">
        {found.purpose === "invite" ? `Choose a password to activate your account. You will sign in with ${found.email}.` : `For ${found.email}`}
      </p>
      <ResetForm token={token} />
    </>
  );
}
