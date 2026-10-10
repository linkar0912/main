import { describe, expect, it } from "vitest";
import {
  LEGAL_ENTITY,
  LEGAL_ENTITY_COMPLETE,
  LEGAL_FILL_ME,
  grievanceOfficerContact,
  legalCopyrightHolder,
  legalJurisdiction,
  legalOperatorStatement,
  legalPostalAddress,
  missingLegalEntityFields,
  type LegalEntity,
} from "./legal-entity";

const filled: LegalEntity = {
  ...LEGAL_ENTITY,
  proprietorName: "Asha Rao",
  address: "12 MG Road, Pune 411001",
  city: "Pune",
  grievanceOfficer: { name: "Asha Rao", email: "grievance@linkar.in" },
  jurisdictionCity: "Pune",
};

describe("LEGAL_ENTITY", () => {
  it("keeps the completeness flag in step with the sentinels", () => {
    // Fails when someone fills the values but forgets the flag, or flips the
    // flag while a "__FILL_ME__" is still in place.
    expect(LEGAL_ENTITY_COMPLETE).toBe(missingLegalEntityFields().length === 0);
  });

  it("is a sole proprietorship trading as Linkar under Indian law", () => {
    expect(LEGAL_ENTITY.entityType).toBe("Sole proprietorship");
    expect(LEGAL_ENTITY.tradeName).toBe("Linkar");
    expect(LEGAL_ENTITY.governingLaw).toBe("India");
  });

  it("never lets a sentinel reach rendered copy while details are missing", () => {
    const pending = { ...LEGAL_ENTITY, proprietorName: LEGAL_FILL_ME, address: LEGAL_FILL_ME, jurisdictionCity: LEGAL_FILL_ME, grievanceOfficer: { name: LEGAL_FILL_ME, email: LEGAL_FILL_ME } };
    const rendered = [
      legalOperatorStatement(pending),
      legalCopyrightHolder(pending),
      String(legalPostalAddress(pending)),
      legalJurisdiction(pending),
      JSON.stringify(grievanceOfficerContact("support@linkar.in", pending)),
    ].join(" ");

    expect(rendered).not.toContain(LEGAL_FILL_ME);
    expect(legalPostalAddress(pending)).toBeNull();
    expect(legalCopyrightHolder(pending)).toBe("Linkar");
    expect(legalJurisdiction(pending)).toBe("the competent courts in India");
    expect(grievanceOfficerContact("support@linkar.in", pending)).toEqual({ name: "The proprietor of Linkar", email: "support@linkar.in" });
  });

  it("names the proprietor, address, officer, and courts once supplied", () => {
    expect(missingLegalEntityFields(filled)).toEqual([]);
    expect(legalOperatorStatement(filled)).toBe("Linkar is operated by Asha Rao, a sole proprietor trading as Linkar.");
    expect(legalCopyrightHolder(filled)).toBe("Asha Rao");
    expect(legalPostalAddress(filled)).toBe("12 MG Road, Pune 411001, India");
    expect(legalJurisdiction(filled)).toBe("the courts at Pune, India");
    expect(grievanceOfficerContact("support@linkar.in", filled)).toEqual({ name: "Asha Rao", email: "grievance@linkar.in" });
  });
});
