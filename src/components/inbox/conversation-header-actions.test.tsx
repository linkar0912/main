// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationHeaderActions } from "./conversation-header-actions";
import type { InboxContact } from "./types";

const contact: InboxContact = {
  id: "contact_1", username: "aanya", avatarUrl: "/avatar", preview: "Hi", lastMessageAt: "2026-09-04T10:00:00.000Z",
  canMessage: true, unread: false, leadStatus: "NEW", tags: [], inboxStatus: "OPEN", favorite: false,
};

describe("ConversationHeaderActions reminder", () => {
  afterEach(cleanup);

  it("saves the reminder once on blur, not on every edited segment", () => {
    const onOperation = vi.fn();
    render(<ConversationHeaderActions contact={contact} members={[]} onOperation={onOperation} />);
    const input = screen.getByLabelText("Conversation reminder");

    fireEvent.change(input, { target: { value: "2026-09-05T09:00" } });
    fireEvent.change(input, { target: { value: "2026-09-05T10:00" } });
    fireEvent.change(input, { target: { value: "2026-09-05T10:30" } });
    expect(onOperation).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onOperation).toHaveBeenCalledTimes(1);
    expect(onOperation).toHaveBeenCalledWith({ action: "set_reminder", reminderAt: new Date("2026-09-05T10:30").toISOString() });
  });

  it("saves on Enter, clears with an empty value, and skips unchanged values", () => {
    const onOperation = vi.fn();
    const withReminder = { ...contact, reminderAt: new Date("2026-09-05T10:30").toISOString() };
    render(<ConversationHeaderActions contact={withReminder} members={[]} onOperation={onOperation} />);
    const input = screen.getByLabelText("Conversation reminder");

    fireEvent.blur(input);
    expect(onOperation).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOperation).toHaveBeenCalledWith({ action: "set_reminder", reminderAt: null });
  });
});
