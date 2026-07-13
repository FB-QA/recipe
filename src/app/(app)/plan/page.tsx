import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { CalendarIcon } from "@/components/icons";

export default function PlanPage() {
  return (
    <>
      <AppHeader title="Meal Plan" />
      <EmptyState icon={<CalendarIcon size={30} />} title="Coming soon">
        Plan your week from the recipes on your shelf — drop them onto days and build a grocery list
        in a tap. We&apos;re cooking this one up next.
      </EmptyState>
    </>
  );
}
