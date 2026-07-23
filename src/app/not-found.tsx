import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
      <div aria-hidden className="mb-4 grid h-[70px] w-[70px] place-items-center rounded-[22px] bg-basil-tint text-basil">
        <SearchIcon size={30} />
      </div>
      <h1 className="text-xl font-bold text-ink">We couldn&apos;t find that</h1>
      <p className="mt-2 text-base text-ink-2">The recipe or page you were after isn&apos;t here.</p>
      <div className="mt-6 w-full max-w-[240px]">
        <Link href="/">
          <Button fullWidth>Back to your kitchen</Button>
        </Link>
      </div>
    </main>
  );
}
