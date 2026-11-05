import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const n = await getDb().user.count();
  if (n > 0) redirect("/login");
  return (
    <>
      <span className="chip mb-4 w-fit bg-primary-soft text-primary">First-time setup</span>
      <h1 className="text-2xl font-semibold tracking-tight">Create your admin account</h1>
      <p className="mt-1.5 text-[15px] text-muted">
        The first account runs this desk. We&apos;ll email you a 6-digit code to confirm your address.
      </p>
      <SetupForm />
    </>
  );
}
