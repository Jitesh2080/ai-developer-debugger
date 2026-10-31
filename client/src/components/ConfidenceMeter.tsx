interface Props {
  value: number; // 0..100
}

export function ConfidenceMeter({ value }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped >= 75
      ? 'bg-emerald-500'
      : clamped >= 50
        ? 'bg-amber-500'
        : 'bg-rose-500';
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Confidence</span>
        <span className="font-mono text-slate-200">{clamped}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
