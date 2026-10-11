import { PRODUCT_NAME } from "./branding";

/**
 * Marks an operator detail the owner has not supplied yet. It is never
 * rendered: every helper below falls back to wording that stays true without
 * the value, so a page never shows the sentinel or a half-filled sentence.
 */
export const LEGAL_FILL_ME = "__FILL_ME__";

export type LegalEntity = {
  /** The name customers know the business by. */
  tradeName: string;
  /** The individual who owns and runs the sole proprietorship. */
  proprietorName: string;
  entityType: "Sole proprietorship";
  /** Principal place of business, as registered for GST and with Razorpay. */
  address: string;
  city: string;
  country: string;
  grievanceOfficer: { name: string; email: string };
  /** Default public support address. Pages prefer the configured SUPPORT_EMAIL. */
  supportEmail: string;
  governingLaw: string;
  /** City whose courts hear disputes under the terms. */
  jurisdictionCity: string;
  /** Effective date of the current legal document set. */
  effectiveDate: string;
};

/**
 * The operator identity shown on the legal pages, the contact page, and the
 * footer. Razorpay's KYC review, the Consumer Protection (E-Commerce) Rules
 * 2020, and the DPDP Act all expect the seller's identity, address, and a named
 * grievance officer to be published. Replace every LEGAL_FILL_ME with the real
 * value and then set LEGAL_ENTITY_COMPLETE to true; legal-entity.test.ts fails
 * if the two disagree.
 */
export const LEGAL_ENTITY: LegalEntity = {
  tradeName: PRODUCT_NAME,
  proprietorName: LEGAL_FILL_ME,
  entityType: "Sole proprietorship",
  address: LEGAL_FILL_ME,
  city: LEGAL_FILL_ME,
  country: "India",
  grievanceOfficer: { name: LEGAL_FILL_ME, email: LEGAL_FILL_ME },
  supportEmail: "support@linkar.in",
  governingLaw: "India",
  jurisdictionCity: LEGAL_FILL_ME,
  effectiveDate: "10 October 2026",
};

/** Flip to true once every LEGAL_FILL_ME above has a real value. */
export const LEGAL_ENTITY_COMPLETE = false;

export function isLegalValueSupplied(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== LEGAL_FILL_ME;
}

/** Every operator field still waiting for a value, by dotted name. */
export function missingLegalEntityFields(entity: LegalEntity = LEGAL_ENTITY): string[] {
  const fields: Array<[string, string]> = [
    ["tradeName", entity.tradeName],
    ["proprietorName", entity.proprietorName],
    ["address", entity.address],
    ["city", entity.city],
    ["country", entity.country],
    ["grievanceOfficer.name", entity.grievanceOfficer.name],
    ["grievanceOfficer.email", entity.grievanceOfficer.email],
    ["supportEmail", entity.supportEmail],
    ["governingLaw", entity.governingLaw],
    ["jurisdictionCity", entity.jurisdictionCity],
    ["effectiveDate", entity.effectiveDate],
  ];
  return fields.filter(([, value]) => !isLegalValueSupplied(value)).map(([name]) => name);
}

/** "Linkar is operated by A. Person, a sole proprietor trading as Linkar." */
export function legalOperatorStatement(entity: LegalEntity = LEGAL_ENTITY): string {
  if (isLegalValueSupplied(entity.proprietorName)) {
    return `${entity.tradeName} is operated by ${entity.proprietorName}, a sole proprietor trading as ${entity.tradeName}.`;
  }
  return `${entity.tradeName} is operated by its proprietor as a sole proprietorship trading as ${entity.tradeName}.`;
}

/** The legal owner for the copyright line: the proprietor, else the trade name. */
export function legalCopyrightHolder(entity: LegalEntity = LEGAL_ENTITY): string {
  return isLegalValueSupplied(entity.proprietorName) ? entity.proprietorName : entity.tradeName;
}

/** Full postal address, or null while it has not been supplied. */
export function legalPostalAddress(entity: LegalEntity = LEGAL_ENTITY): string | null {
  if (!isLegalValueSupplied(entity.address)) return null;
  const parts = [entity.address];
  if (isLegalValueSupplied(entity.city) && !entity.address.includes(entity.city)) parts.push(entity.city);
  if (!entity.address.includes(entity.country)) parts.push(entity.country);
  return parts.join(", ");
}

/**
 * Who handles grievances. Until a named officer is supplied, the proprietor is
 * the officer by default and complaints go to the support address.
 */
export function grievanceOfficerContact(supportEmail: string, entity: LegalEntity = LEGAL_ENTITY): { name: string; email: string } {
  const name = isLegalValueSupplied(entity.grievanceOfficer.name)
    ? entity.grievanceOfficer.name
    : isLegalValueSupplied(entity.proprietorName)
      ? entity.proprietorName
      : `the proprietor of ${entity.tradeName}`;
  const email = isLegalValueSupplied(entity.grievanceOfficer.email) ? entity.grievanceOfficer.email : supportEmail;
  return { name, email };
}

/** "the courts at Pune, India", or the national fallback without a city. */
export function legalJurisdiction(entity: LegalEntity = LEGAL_ENTITY): string {
  return isLegalValueSupplied(entity.jurisdictionCity)
    ? `the courts at ${entity.jurisdictionCity}, ${entity.governingLaw}`
    : `the competent courts in ${entity.governingLaw}`;
}
