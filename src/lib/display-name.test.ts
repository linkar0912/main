import { describe, expect, it } from "vitest";
import { firstNameFromEmail, friendlyFirstName, greetingFor } from "./display-name";

describe("friendly names", () => {
  it("strips trailing digits from the email handle", () => {
    expect(firstNameFromEmail("tejastelkar9@gmail.com")).toBe("Tejastelkar");
    expect(greetingFor("tejastelkar9@gmail.com")).toBe("Hello, Tejastelkar");
  });

  it("uses the first word of a separated handle", () => {
    expect(firstNameFromEmail("tejas.telkar@example.com")).toBe("Tejas");
    expect(firstNameFromEmail("priya_92@example.com")).toBe("Priya");
    expect(firstNameFromEmail("RAHUL-k+promo@example.com")).toBe("Rahul");
  });

  it("prefers a profile display name when one exists", () => {
    expect(friendlyFirstName("tejastelkar9@gmail.com", "Tejas Telkar")).toBe("Tejas");
    expect(friendlyFirstName("tejastelkar9@gmail.com", "   ")).toBe("Tejastelkar");
  });

  it("falls back to Welcome back when nothing human remains", () => {
    for (const email of ["", "12345@example.com", "admin@example.com", "x9@example.com", "support@linkar.in"]) {
      expect(greetingFor(email)).toBe("Welcome back");
    }
  });
});
