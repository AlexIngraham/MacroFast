import { formatMetric } from "@/lib/metrics";

export function MacroStat({ label, value, unit = "g", primary = false }: {
  label: string;
  value: number | null;
  unit?: string;
  primary?: boolean;
}) {
  return (
    <div className={primary ? "macro-stat macro-stat-primary" : "macro-stat"}>
      <span>{label}</span>
      <strong>{formatMetric(value)}{value === null ? "" : unit}</strong>
    </div>
  );
}
