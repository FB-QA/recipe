import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CloseIcon } from "@/components/icons";
import { PasteFlow } from "@/components/import/paste-flow";

export default function PastePage() {
  return (
    <>
      <AppHeader
        title="Paste a recipe"
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
      <PasteFlow />
    </>
  );
}
