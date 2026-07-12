import { BottomNav } from "@/components/nav/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px]">
      <main className="px-[18px] pb-[100px] pt-2">{children}</main>
      <BottomNav />
    </div>
  );
}
