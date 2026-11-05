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
        <p className="mt-2 text-[15px] text-muted">Reset links work once and only for 1 hour. You can ask for a new one.</p>
        <Link href="/forgot" className="btn-primary mt-8 w-full">
          Send a new link
        </Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-[15px] text-muted">For {found.email}</p>
      <ResetForm token={token} />
    </>
  );
}
