import { redirect } from "next/navigation";

// The shelf lives at "/" now — keep this path working for old links.
export default function RecipesPage() {
  redirect("/");
}
