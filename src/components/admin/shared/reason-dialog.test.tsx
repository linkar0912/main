// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReasonDialog } from "./reason-dialog";
afterEach(cleanup);
it("traps focus, restores it, and prevents dismissal during an in-flight command", async () => {
  const cancel = vi.fn(); const confirm = vi.fn();
  const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
  const { rerender, unmount } = render(<ReasonDialog title="Pause queue" onCancel={cancel} onConfirm={confirm} busy={false} />);
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
  await userEvent.type(screen.getByRole("textbox"), "  review  ");
  await userEvent.click(screen.getByRole("button", { name: "Confirm action" }));
  expect(confirm).toHaveBeenCalledWith("review");
  await userEvent.tab(); expect(document.activeElement).toBe(screen.getByRole("textbox"));
  rerender(<ReasonDialog title="Pause queue" onCancel={cancel} onConfirm={confirm} busy />);
  await userEvent.keyboard("{Escape}"); expect(cancel).not.toHaveBeenCalled();
  unmount(); expect(document.activeElement).toBe(trigger); expect(document.body.style.overflow).toBe(""); trigger.remove();
});
