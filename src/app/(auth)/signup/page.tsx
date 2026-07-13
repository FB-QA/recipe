"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/app/(auth)/actions";
import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";

export default function SignupPage() {
  const [state, action] = useActionState<AuthState, FormData>(signUp, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField label="Your name" name="displayName" autoComplete="name" placeholder="Romy" required />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="romy@example.com"
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        hint="At least 8 characters."
        required
      />
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
      <SubmitButton fullWidth>Create account</SubmitButton>
      <p className="pt-1 text-center text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-basil">
          Log in
        </Link>
      </p>
    </form>
  );
}
