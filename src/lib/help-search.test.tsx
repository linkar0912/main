import { describe, expect, it } from "vitest";
import { helpArticleMatchesQuery } from "./help-search";

describe("helpArticleMatchesQuery", () => {
  it("matches text that appears only inside the rendered answer", () => {
    const matches = helpArticleMatchesQuery(
      { title: "Troubleshooting", blurb: "Fix common connection problems." },
      {
        question: "Why did delivery stop?",
        answer: <p>Reconnect when the provider reports an expired access token.</p>,
      },
      "expired access token",
    );

    expect(matches).toBe(true);
  });

  it("normalizes case and spacing across nested answer nodes", () => {
    const matches = helpArticleMatchesQuery(
      { title: "Contacts", blurb: "Manage leads." },
      {
        question: "How do fields work?",
        answer: <><strong>Custom</strong>{"   "}<span>Answers</span></>,
      },
      "custom answers",
    );

    expect(matches).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(helpArticleMatchesQuery(
      { title: "Contacts", blurb: "Manage leads." },
      { question: "How do fields work?", answer: <p>Answers are stored on the contact.</p> },
      "webhook signature",
    )).toBe(false);
  });
});
