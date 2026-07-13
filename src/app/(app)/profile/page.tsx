import { signOut } from "@/app/(auth)/actions";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { countRecipes } from "@/lib/recipes/queries";
import { getProfile, countImports } from "@/lib/profile/queries";
import { firstName } from "@/lib/name";

export default async function ProfilePage() {
  // Was four awaits in a row — verify the token, fetch the profile, count the
  // recipes, count the imports — each waiting on the last for no reason. They are
  // independent, so they run together.
  const [profile, recipeCount, importCount] = await Promise.all([
    getProfile(),
    countRecipes(),
    countImports(),
  ]);

  const name = profile.displayName ?? firstName(profile.email);
  const initial = (name?.[0] ?? "?").toUpperCase();

  return (
    <>
      <AppHeader title="Profile" />

      <div className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-4">
        <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-gradient-to-br from-basil to-basil-2 text-[20px] font-extrabold text-white">
          {initial}
        </div>
        <div>
          <div className="text-[16px] font-bold text-ink">{name}</div>
          {/* getProfile() already falls back to the identity the proxy verified,
              so the two-way `?? user?.email` this replaced is now one value. */}
          <div className="text-[13px] text-ink-3">{profile.email}</div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        <Row label="Recipes" value={String(recipeCount)} />
        <Row label="Imports" value={`${importCount ?? 0} · free tier`} />
        <div className="flex items-center justify-between rounded-[14px] border border-line bg-surface px-4 py-3 text-[14.5px] font-semibold text-ink">
          <span>Appearance</span>
          <ThemeToggle />
        </div>
      </div>

      <form action={signOut} className="mt-3">
        <Button type="submit" variant="ghost" fullWidth>
          Sign out
        </Button>
      </form>

      <p className="mt-[18px] text-center text-[11.5px] leading-relaxed text-ink-3">
        Kept minimal for V1.
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-line bg-surface px-4 py-[15px] text-[14.5px] font-semibold text-ink">
      {label}
      <span className="text-[13px] font-medium text-ink-3">{value}</span>
    </div>
  );
}
