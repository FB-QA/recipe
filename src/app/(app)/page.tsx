import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/name";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user!.id)
    .single();

  const name = firstName(profile?.display_name);

  // M1 wires the recipe shelf here. For now the shelf is empty by definition.
  return (
    <>
      <AppHeader title={`${name}'s Kitchen`} subtitle="Let's fill the shelf" />
      <EmptyState
        emoji="🧺"
        title="Your shelf is empty"
        action={
          <Link href="/add">
            <Button>Add your first recipe</Button>
          </Link>
        }
      >
        Tap the + below to add your first recipe — paste a link from Instagram or any recipe site
        and it&apos;ll pull the recipe out. No more screenshots into ChatGPT.
      </EmptyState>
    </>
  );
}
