/** The honesty banner shown above an extracted recipe ("nothing invented"). */
export function ImportNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 flex gap-2 rounded-sm border border-line bg-surface-2 px-3.5 py-2.5 text-xs leading-snug text-ink-2">
      {children}
    </p>
  );
}
