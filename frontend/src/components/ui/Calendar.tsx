import React from "react";

export type CalendarProps = {
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  onClose?: () => void;
  holidaysLabelByDate?: Map<string, string>;
};

function ymdFromDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function dateFromYmdUTC(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function addMonthsUTC(d: Date, delta: number): Date {
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  nd.setUTCMonth(nd.getUTCMonth() + delta);
  return nd;
}

function daysInMonthUTC(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function isDisabled(ymd: string, min?: string, max?: string) {
  if (min && ymd < min) return true;
  if (max && ymd > max) return true;
  return false;
}

export default function Calendar({
  value,
  onChange,
  min,
  max,
  onClose,
  holidaysLabelByDate,
}: CalendarProps) {
  const todayStr = ymdFromDateUTC(new Date());
  const initial = value ? dateFromYmdUTC(value) : new Date();
  const [view, setView] = React.useState<Date>(
    new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)),
  );

  const monthName = React.useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(view);
  }, [view]);

  // Monday-first grid
  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // 0..6, Mon=0
  const daysInPrev = daysInMonthUTC(year, (month + 11) % 12);
  const daysInThis = daysInMonthUTC(year, month);

  const cells: { ymd: string; label: number; muted: boolean }[] = [];
  // Leading days from previous month
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const d = new Date(Date.UTC(year, month - 1, day));
    cells.push({ ymd: ymdFromDateUTC(d), label: day, muted: true });
  }
  // Current month
  for (let d = 1; d <= daysInThis; d++) {
    const dt = new Date(Date.UTC(year, month, d));
    cells.push({ ymd: ymdFromDateUTC(dt), label: d, muted: false });
  }
  // Trailing to fill 6 rows
  const total = Math.ceil(cells.length / 7) * 7;
  for (let d = 1; cells.length < total; d++) {
    const dt = new Date(Date.UTC(year, month + 1, d));
    cells.push({ ymd: ymdFromDateUTC(dt), label: d, muted: true });
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="calendar-pop card" role="dialog" aria-label="Choose date">
      <div className="calendar-header">
        <button
          className="btn"
          onClick={() => setView(addMonthsUTC(view, -1))}
          aria-label="Previous month"
        >
          ◀
        </button>
        <div className="calendar-title">{monthName}</div>
        <button
          className="btn"
          onClick={() => setView(addMonthsUTC(view, 1))}
          aria-label="Next month"
        >
          ▶
        </button>
      </div>
      <div className="calendar-weekdays">
        {weekdays.map((d) => (
          <div key={d} className="muted mini" aria-hidden="true">
            {d}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((c) => {
          const selected = value === c.ymd;
          const today = todayStr === c.ymd;
          const disabled = isDisabled(c.ymd, min, max);
          const hasHoliday = !!holidaysLabelByDate?.get(c.ymd);
          const className = [
            "calendar-day",
            c.muted ? "muted" : "",
            selected ? "selected" : "",
            today ? "today" : "",
            disabled ? "disabled" : "",
            hasHoliday ? "holiday" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={c.ymd}
              type="button"
              className={className}
              title={hasHoliday ? holidaysLabelByDate!.get(c.ymd) || "" : undefined}
              aria-label={hasHoliday ? `${holidaysLabelByDate!.get(c.ymd)}` : undefined}
              onClick={() => {
                if (!disabled) {
                  onChange(c.ymd);
                  onClose?.();
                }
              }}
              disabled={disabled}
              aria-pressed={selected}
            >
              <span>{c.label}</span>
              {hasHoliday && <span className="day-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="calendar-footer">
        <button
          className="btn"
          onClick={() => {
            onChange(todayStr);
            onClose?.();
          }}
        >
          Today
        </button>
      </div>
    </div>
  );
}
