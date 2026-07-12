import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { GroceryBoard } from "@/components/grocery/grocery-board";
import { getBoard } from "@/lib/grocery/queries";
import { createList } from "@/lib/grocery/actions";

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { list } = await searchParams;
  const board = await getBoard(list);

  return (
    <>
      <AppHeader title="Grocery" />
      {board.lists.length === 0 ? (
        <EmptyState
          emoji="🛒"
          title="No lists yet"
          action={
            <form action={createList.bind(null, undefined)}>
              <input type="hidden" name="name" value="This Week" />
              <SubmitButton>Start a list</SubmitButton>
            </form>
          }
        >
          Add ingredients straight from a recipe, or start a list of your own — it&apos;ll show up
          here.
        </EmptyState>
      ) : (
        <GroceryBoard {...board} />
      )}
    </>
  );
}
