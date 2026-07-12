"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

async function siteUrl() {
  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host") ?? "localhost:3000"}`;
  return origin;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "That email and password don't match. Try again." };
  }

  const next = (formData.get("next") as string) || "/";
  redirect(next);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const schema = credentials.extend({
    displayName: z.string().trim().min(1, "Tell us your name.").max(60),
  });
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Local dev auto-confirms → a session exists immediately.
  if (data.session) {
    redirect("/");
  }
  // Production with email confirmation on → ask them to verify.
  return {
    message: "Check your email to confirm your account, then sign in.",
  };
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password/update`,
  });
  // Always report success — never reveal whether an email is registered.
  return {
    message: "If that email has an account, a reset link is on its way.",
  };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = z.string().min(8, "Password must be at least 8 characters.").safeParse(
    formData.get("password"),
  );
  if (!password.success) {
    return { error: password.error.issues[0]?.message ?? "Check your password." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
