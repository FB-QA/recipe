import { BottomNav } from "@/components/nav/bottom-nav";
import { PageTransition } from "@/components/motion/page-transition";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px]">
      <main id="main" className="px-[18px] pb-[100px] pt-2">
        <PageTransition>{children}</PageTransition>
      </main>
      <BottomNav />
    </div>
  );
}
