// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MediaPicker } from "./media-picker";
import type { MediaSnapshot } from "@/src/lib/automation/types";

const reel = {
  id: "media_1",
  caption: "Our newest Reel drop",
  mediaType: "VIDEO" as const,
  mediaProductType: "REELS" as const,
  permalink: "https://www.instagram.com/reel/media_1/",
  mediaUrl: "https://cdn.example/media_1.mp4",
  thumbnailUrl: "https://cdn.example/media_1.jpg",
  timestamp: "2026-08-20T08:00:00.000Z",
};

const post = {
  id: "media_2",
  caption: "A regular feed post",
  mediaType: "IMAGE" as const,
  mediaProductType: "FEED" as const,
  permalink: "https://www.instagram.com/p/media_2/",
  mediaUrl: "https://cdn.example/media_2.jpg",
  timestamp: "2026-08-19T08:00:00.000Z",
};

const noPreview = {
  id: "media_3",
  mediaType: "CAROUSEL_ALBUM" as const,
  permalink: "https://www.instagram.com/p/media_3/",
  timestamp: "2026-08-18T08:00:00.000Z",
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function ControlledPicker({
  initialIds = [],
  initialSnapshots = [],
}: {
  initialIds?: string[];
  initialSnapshots?: MediaSnapshot[];
}) {
  const [ids, setIds] = useState<string[]>(initialIds);
  const [snapshots, setSnapshots] = useState<MediaSnapshot[]>(initialSnapshots);
  return (
    <div>
      <MediaPicker
        selectedIds={ids}
        initialSnapshots={initialSnapshots}
        onChange={(nextIds, nextSnapshots) => {
          setIds(nextIds);
          setSnapshots(nextSnapshots);
        }}
      />
      <output data-testid="picker-state">{JSON.stringify({ ids, snapshots })}</output>
    </div>
  );
}

describe("MediaPicker", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a loading state before the first page resolves", () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    render(<MediaPicker selectedIds={[]} onChange={() => {}} />);

    expect(screen.getByTestId("media-picker-loading")).toBeTruthy();
  });

  it("shows an empty state when the account has no media", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MediaPicker selectedIds={[]} onChange={() => {}} />);

    expect(await screen.findByText(/no instagram media/i)).toBeTruthy();
  });

  it("shows the server's error message when loading fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "Connect Instagram first" }, false));
    vi.stubGlobal("fetch", fetchMock);

    render(<MediaPicker selectedIds={[]} onChange={() => {}} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Connect Instagram first");
  });

  it("labels Reels and posts distinctly and renders a fallback for media with no image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [reel, post, noPreview], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MediaPicker selectedIds={[]} onChange={() => {}} />);

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));
    expect(screen.getByText("Reel")).toBeTruthy();
    expect(screen.getAllByText("Post")).toHaveLength(2);
    expect(screen.queryByRole("img", { name: /media_3/i })).toBeNull();
    expect(screen.getByRole("img", { name: /our newest reel drop/i }).getAttribute("src")).toBe(reel.thumbnailUrl);
  });

  it("gives thumbnails useful, non-empty alt text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [reel], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MediaPicker selectedIds={[]} onChange={() => {}} />);

    const image = await screen.findByRole("img");
    expect(image.getAttribute("alt")?.trim().length).toBeGreaterThan(0);
    expect(image.getAttribute("alt")).toContain("Our newest Reel drop");
  });

  it("marks previously selected media as checked", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [reel, post], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MediaPicker selectedIds={["media_2"]} onChange={() => {}} />);

    const checkboxes = await screen.findAllByRole("checkbox");
    const selected = checkboxes.find((node) => node.getAttribute("aria-checked") === "true");
    expect(selected).toBeTruthy();
    expect(selected?.textContent).toContain("A regular feed post");
    const unselected = checkboxes.find((node) => node !== selected);
    expect(unselected?.getAttribute("aria-checked")).toBe("false");
  });

  it("supports selecting multiple items by mouse and reports immutable snapshots", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [reel, post], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledPicker />);

    fireEvent.click(await screen.findByText("Our newest Reel drop"));
    fireEvent.click(screen.getByText("A regular feed post"));

    const state = JSON.parse(screen.getByTestId("picker-state").textContent ?? "{}") as {
      ids: string[];
      snapshots: MediaSnapshot[];
    };
    expect(state.ids).toEqual(["media_1", "media_2"]);
    expect(state.snapshots).toEqual([
      {
        id: "media_1",
        caption: "Our newest Reel drop",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/media_1/",
        timestamp: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "media_2",
        caption: "A regular feed post",
        mediaType: "IMAGE",
        mediaProductType: "FEED",
        permalink: "https://www.instagram.com/p/media_2/",
        timestamp: "2026-08-19T08:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(state.snapshots)).not.toContain("mediaUrl");
    expect(JSON.stringify(state.snapshots)).not.toContain("thumbnailUrl");
  });

  it("toggles selection with the keyboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [reel], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledPicker />);

    const card = await screen.findByRole("checkbox");
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true"));

    fireEvent.keyDown(card, { key: " " });
    await waitFor(() => expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false"));
  });

  it("loads more pages on demand, merges by media ID, and hides the control once exhausted", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [reel], paging: { after: "cursor-2" } }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [reel, post], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MediaPicker selectedIds={[]} onChange={() => {}} />);

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    const loadMore = screen.getByRole("button", { name: /load more/i });
    fireEvent.click(loadMore);

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("after=cursor-2");
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("preserves the snapshot of an already-selected item this instance never fetched when an unrelated item is toggled", async () => {
    const unfetchedSnapshot: MediaSnapshot = {
      id: "media_page2",
      caption: "Selected in an earlier session, lives on page 2",
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      permalink: "https://www.instagram.com/reel/media_page2/",
      timestamp: "2026-08-10T08:00:00.000Z",
    };
    // Only page 1 (containing `reel`, not `media_page2`) is ever fetched by this instance.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [reel], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ControlledPicker initialIds={["media_page2"]} initialSnapshots={[unfetchedSnapshot]} />);

    // The unfetched item never renders as a card (its page was never loaded) - only `reel` does.
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    fireEvent.click(screen.getByText("Our newest Reel drop"));

    const state = JSON.parse(screen.getByTestId("picker-state").textContent ?? "{}") as {
      ids: string[];
      snapshots: MediaSnapshot[];
    };
    expect(state.ids).toEqual(["media_page2", "media_1"]);
    expect(state.snapshots).toEqual([
      unfetchedSnapshot,
      {
        id: "media_1",
        caption: "Our newest Reel drop",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/media_1/",
        timestamp: "2026-08-20T08:00:00.000Z",
      },
    ]);
  });
});
