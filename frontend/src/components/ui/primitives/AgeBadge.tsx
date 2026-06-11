import React from "react";
import { SignalBadge, type SignalTone } from "./SignalBadge";

const TZ_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function parseTimestamp(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const hasTimePart = /[T ]\d{2}:\d{2}/.test(trimmed);
  const normalized =
    hasTimePart && !TZ_OFFSET_RE.test(trimmed)
      ? `${trimmed.replace(" ", "T")}Z`
      : trimmed;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Live-ticking relative age for a backend timestamp. Timestamps without an
 * explicit timezone suffix are treated as UTC.
 */
export function useRelativeTime(
  iso: string | null | undefined,
  tickMs = 30_000
): { label: string; ageMs: number | null } {
  const timestampMs = React.useMemo(() => parseTimestamp(iso), [iso]);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (timestampMs == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [timestampMs, tickMs]);

  return React.useMemo(() => {
    if (timestampMs == null) return { label: "—", ageMs: null };
    const ageMs = now - timestampMs;
    return { label: formatAge(ageMs), ageMs };
  }, [timestampMs, now]);
}

export interface AgeBadgeProps {
  timestamp?: string | null;
  warnAfterMs?: number;
  staleAfterMs?: number;
  prefix?: string;
}

/**
 * Data-freshness badge ("as of 12m ago"): neutral while fresh, warn past
 * `warnAfterMs`, down past `staleAfterMs`. Compact enough for PageHeader actions.
 */
export const AgeBadge: React.FC<AgeBadgeProps> = ({
  timestamp,
  warnAfterMs = 30 * 60_000,
  staleAfterMs = 2 * 3_600_000,
  prefix = "as of",
}) => {
  const { label, ageMs } = useRelativeTime(timestamp);
  const timestampMs = React.useMemo(() => parseTimestamp(timestamp), [timestamp]);

  const tone: SignalTone =
    ageMs == null
      ? "neutral"
      : ageMs >= staleAfterMs
      ? "down"
      : ageMs >= warnAfterMs
      ? "warn"
      : "neutral";

  return (
    <SignalBadge
      tone={tone}
      fontSize="xs"
      whiteSpace="nowrap"
      title={
        timestampMs == null ? undefined : new Date(timestampMs).toLocaleString()
      }
      aria-live="off"
    >
      {ageMs == null ? "—" : `${prefix} ${label}`}
    </SignalBadge>
  );
};
