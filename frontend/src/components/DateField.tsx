import React from "react";
import { createPortal } from "react-dom";
import Calendar from "./ui/Calendar";
import { formatYMDToLocale } from "../lib/date";

type Props = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  holidaysLabelByDate?: Map<string, string>;
};

export default function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  style,
  holidaysLabelByDate,
}: Props) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const portalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const wrap = wrapRef.current;
      const portalEl = portalRef.current;
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return;
      if (portalEl && e.target instanceof Node && portalEl.contains(e.target)) return;
      setOpen(false);
    }
    // Dismiss on page scroll/resize instead of repositioning. Tracking the
    // input frame-by-frame causes jitter on iOS momentum scroll, and matches
    // the native popover/select dismissal pattern.
    function dismiss(e: Event) {
      if (e.target instanceof Node && portalRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  function positionPortal() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const width = 300;
    const margin = 8;
    let left = rect.right - width;
    if (left < margin) left = margin;
    const rightEdge = left + width;
    const vw = window.innerWidth;
    if (rightEdge > vw - margin) left = Math.max(margin, vw - margin - width);
    const top = rect.bottom + margin;
    setPos({ top, left });
  }

  function openPicker() {
    if (disabled) return;
    setOpen((v) => {
      const next = !v;
      if (next) positionPortal();
      return next;
    });
  }

  return (
    <div
      ref={wrapRef}
      className={["date-field", disabled ? "is-disabled" : "", className || ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <input
        type="text"
        readOnly
        className="input date-input"
        value={value ? formatYMDToLocale(value, { dateStyle: "short" }) : ""}
        disabled={disabled}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      />
      <button
        type="button"
        className="date-button"
        onClick={openPicker}
        aria-label="Open calendar"
        disabled={disabled}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 9H21" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 3V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M16 3V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={portalRef}
            style={{ position: "fixed", zIndex: 3000, top: pos.top, left: pos.left }}
          >
            <Calendar
              value={value}
              onChange={(d) => {
                onChange(d);
                setOpen(false);
              }}
              min={min}
              max={max}
              onClose={() => setOpen(false)}
              holidaysLabelByDate={holidaysLabelByDate}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
