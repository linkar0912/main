import type { ReactNode } from "react";

/**
 * The one header every workspace screen uses: title + one-line description on
 * the left, actions on the right, optional back link above and tabs below.
 * Keeping it in one place is what keeps spacing and type identical per page.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  tabs,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-header ${tabs ? "has-tabs" : ""} ${className}`.trim()}>
      {back}
      <div className="page-header-row">
        <div className="page-header-copy">
          <h1>{title}</h1>
          {description ? <p className="page-lede">{description}</p> : null}
        </div>
        {actions ? <div className="header-actions">{actions}</div> : null}
      </div>
      {tabs}
    </header>
  );
}

/** A titled card section - the single building block for page content. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  flush = false,
  ...rest
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drop body padding for lists/tables that run edge to edge. */
  flush?: boolean;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={`surface ${flush ? "is-flush" : ""} ${className}`.trim()} {...rest}>
      {title || action ? (
        <div className="surface-head">
          <div className="surface-head-copy">
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="surface-head-action">{action}</div> : null}
        </div>
      ) : null}
      <div className="surface-body">{children}</div>
    </section>
  );
}
