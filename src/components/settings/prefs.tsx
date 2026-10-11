import type { CSSProperties, ReactNode } from "react";

/**
 * The Settings "preferences list" pattern: a section is an h2 plus one line,
 * made of groups; a group is a quiet title (with an optional action on the
 * right) over ONE card whose rows are split by hairlines - label and helper
 * on the left, the control or value on the right. Rows stack on phones.
 */

export function PrefsSectionHead({ id, title, description, back }: {
  id: string;
  title: string;
  description: ReactNode;
  /** The phone-only "Settings" back link of the drill-in layout. */
  back?: ReactNode;
}) {
  return (
    <header className="prefs-section-head">
      {back}
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

export function PrefsGroupHead({ id, title, description, action, count }: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** A quiet count after the title ("Members 3"). */
  count?: number;
}) {
  return (
    <div className="prefs-group-head">
      <div className="prefs-group-copy">
        <h3 id={id}>{title}{count !== undefined ? <span className="prefs-group-count">{count}</span> : null}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="prefs-group-action">{action}</div> : null}
    </div>
  );
}

export function PrefsRow({ label, helper, children, className = "", disabled }: {
  label: ReactNode;
  helper?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Dims the copy while the control is switched off (quiet hours off). */
  disabled?: boolean;
}) {
  return (
    <div className={`prefs-row ${className}`.trim()} data-disabled={disabled || undefined}>
      <div className="prefs-row-copy">
        <strong>{label}</strong>
        {helper ? <small>{helper}</small> : null}
      </div>
      {children ? <div className="prefs-row-control">{children}</div> : null}
    </div>
  );
}

/**
 * "6,482 of 25,000" with a bar. A monthly allowance (`kind="allowance"`)
 * turns amber at 80% and red when used up; a count of things (accounts,
 * seats) is amber only when every slot is taken and red past the limit, so a
 * solo owner on one seat is not an alarm. A limit of 0 or less shows no bar.
 */
export function usageTone(used: number, limit: number, kind: "allowance" | "count"): "normal" | "warning" | "danger" {
  if (limit <= 0) return "normal";
  const ratio = used / limit;
  if (kind === "count") return ratio > 1 ? "danger" : ratio === 1 ? "warning" : "normal";
  return ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "normal";
}

export function UsageMeter({ label, used, limit, unit, ariaLabel, kind = "allowance" }: {
  label: string;
  used: number;
  limit: number;
  /** Plural noun after the numbers ("deliveries"); omitted when the label says it. */
  unit?: string;
  ariaLabel?: string;
  kind?: "allowance" | "count";
}) {
  const ratio = limit > 0 ? used / limit : 0;
  const tone = usageTone(used, limit, kind);
  const value = Math.min(used, Math.max(limit, 0));
  return (
    <div className="prefs-meter" data-tone={tone}>
      <div className="prefs-meter-copy">
        <span>{label}</span>
        <strong>
          {used.toLocaleString("en-IN")}
          <span> of {limit.toLocaleString("en-IN")}{unit ? ` ${unit}` : ""}</span>
        </strong>
      </div>
      {limit > 0 ? (
        <div
          className="prefs-meter-bar"
          role="progressbar"
          aria-label={ariaLabel ?? label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={value}
          aria-valuetext={`${used.toLocaleString("en-IN")} of ${limit.toLocaleString("en-IN")}`}
        >
          {/* Filled with transform (CSS grows it in from 0 on first paint). */}
          <span style={{ "--meter": Math.min(1, ratio) } as CSSProperties} />
        </div>
      ) : null}
    </div>
  );
}
