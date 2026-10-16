import Link from "next/link";
import { ButtonRoll } from "../../../button-roll";
import { ctaHeadline, ctaHeadlineLead, ctaHeadlineMark, ctaPrimary, ctaSecondary } from "./copy";

/*
 * Shared pieces of the closing block. Every variant sets the same headline:
 * two lines, with "once." as a tilted sticker in the page's CTA tone. The
 * space between the lines keeps the accessible name a normal sentence.
 */
export function CtaHeadline({ classes }: { classes: { title: string; line: string; mark: string } }) {
  return (
    <h2 id="start-title" className={classes.title}>
      <span className={classes.line}>{ctaHeadlineLead} <span className={classes.mark}>{ctaHeadlineMark}</span></span>{" "}
      <span className={classes.line}>{ctaHeadline[1]}</span>
    </h2>
  );
}

export function CtaActions({ className, primaryClassName, secondaryClassName }: { className: string; primaryClassName: string; secondaryClassName: string }) {
  return (
    <div className={className}>
      <a className={primaryClassName} href={ctaPrimary.href}><ButtonRoll label={ctaPrimary.label} /></a>
      <Link className={secondaryClassName} href={ctaSecondary.href}>{ctaSecondary.label}</Link>
    </div>
  );
}
