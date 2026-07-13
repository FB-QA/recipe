"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/app/(auth)/actions";
import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";

export default function ResetPasswordPage() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Enter your email and we&apos;ll send a link to set a new password.
      </p>
      <TextField label="Email" name="email" type="email" autoComplete="email" placeholder="romy@example.com" required />
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="rounded-sm bg-basil-tint px-4 py-3 text-sm text-basil">
          {state.message}
        </p>
      )}
      <SubmitButton fullWidth>Send reset link</SubmitButton>
      <p className="pt-1 text-center text-sm">
        <Link href="/login" className="font-semibold text-basil">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
