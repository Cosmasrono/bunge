import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CODE_MINUTES, getPendingSignup, maskEmail, RESEND_SECONDS } from "@/lib/auth/signup";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Check your email" };

export default async function VerifyPage() {
  const pending = await getPendingSignup();
  if (!pending) redirect("/signup?expired=1");
  const waitSeconds = Math.max(0, RESEND_SECONDS - Math.floor((new Date().getTime() - pending.lastSentAt.getTime()) / 1000));
  return (
    <>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <MailCheck className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mt-1.5 text-[15px] text-muted">
        We sent a 6-digit code to <b className="text-text">{maskEmail(pending.email)}</b>. It expires in {CODE_MINUTES} minutes.
      </p>
      <VerifyForm initialWait={waitSeconds} />
      <p className="mt-8 text-center text-sm text-muted">
        Wrong email?{" "}
        <Link href={pending.role === "admin" ? "/setup" : "/signup"} className="font-semibold text-primary hover:underline">
          Start again
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-faint">Can&apos;t find it? Check your spam or promotions folder.</p>
    </>
  );
}
