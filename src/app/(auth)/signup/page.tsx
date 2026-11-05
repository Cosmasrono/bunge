import { LogIn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const n = await getDb().user.count();
  if (n === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { expired } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-[15px] text-muted">
        We&apos;ll email you a 6-digit code to confirm it&apos;s really you.
      </p>
      {expired && (
        <p className="mt-6 rounded-xl bg-warning-soft px-3.5 py-3 text-sm text-warning">
          That sign-up expired. Please fill in the form again.
        </p>
      )}
      <SignupForm />
      <div className="mt-8">
        <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-faint uppercase">
          <span className="h-px flex-1 bg-border" />
          Already have an account?
          <span className="h-px flex-1 bg-border" />
        </div>
        <Link href="/login" className="btn-secondary mt-4 w-full">
          <LogIn className="size-4" /> Sign in instead
        </Link>
      </div>
    </>
  );
}
