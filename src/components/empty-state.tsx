export function EmptyState({
  emoji,
  title,
  children,
  action,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-1.5 rounded-card border border-dashed border-line-2 bg-surface px-6 py-11 text-center">
      <div
        aria-hidden
        className="mx-auto mb-4 grid h-[70px] w-[70px] place-items-center rounded-[22px] bg-basil-tint text-[32px]"
      >
        {emoji}
      </div>
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-ink-2">{children}</p>
      {action && <div className="mt-[18px] flex justify-center">{action}</div>}
    </div>
  );
}
