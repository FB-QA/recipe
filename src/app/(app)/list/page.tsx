import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";

// M3 builds grocery lists here.
export default function ListPage() {
  return (
    <>
      <AppHeader title="Grocery" />
      <EmptyState emoji="🛒" title="No lists yet">
        Add ingredients straight from a recipe, or start a list of your own — it&apos;ll show up here.
      </EmptyState>
    </>
  );
}
