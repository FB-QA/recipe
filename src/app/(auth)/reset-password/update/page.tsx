"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/(auth)/actions";
import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";

export default function UpdatePasswordPage() {
  const [state, action] = useActionState<AuthState, FormData>(updatePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-base text-ink-2">Choose a new password for your account.</p>
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        required
      />
      {state?.error && (
        <p role="alert" className="text-base font-medium text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton fullWidth>Save new password</SubmitButton>
    </form>
  );
}
