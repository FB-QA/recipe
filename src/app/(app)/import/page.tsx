import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CloseIcon } from "@/components/icons";
import { ImportFlow } from "@/components/import/import-flow";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  const src = source === "instagram" ? "instagram" : "web";

  return (
    <>
      <AppHeader
        title="Import a recipe"
        action={
          <Link
            href="/add"
            aria-label="Cancel"
            className="grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-2"
          >
            <CloseIcon size={18} />
          </Link>
        }
      />
      <ImportFlow source={src} />
    </>
  );
}
