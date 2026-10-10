"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { FacebookActivity } from "./facebook-activity";
import { InstagramInbox } from "./instagram-inbox";
import { InstagramGlyph } from "../instagram-glyph";
import { FacebookGlyph } from "../facebook-glyph";
import { PageHeader } from "../page-header";

type Channel = "instagram" | "facebook";
const CHANNELS: Channel[] = ["instagram", "facebook"];

export function InboxWorkspace() {
  const [active, setActive] = useState<Channel>("instagram");
  const [facebookOpened, setFacebookOpened] = useState(false);
  const tabRefs = useRef<Record<Channel, HTMLButtonElement | null>>({ instagram: null, facebook: null });

  function select(channel: Channel) {
    if (channel === "facebook") setFacebookOpened(true);
    setActive(channel);
  }

  // Tabs pattern: one tab stop for the group, arrows (and Home/End) move
  // between tabs and select them.
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = CHANNELS.indexOf(active);
    let next: Channel | undefined;
    if (event.key === "ArrowRight") next = CHANNELS[(index + 1) % CHANNELS.length];
    else if (event.key === "ArrowLeft") next = CHANNELS[(index - 1 + CHANNELS.length) % CHANNELS.length];
    else if (event.key === "Home") next = CHANNELS[0];
    else if (event.key === "End") next = CHANNELS[CHANNELS.length - 1];
    if (!next) return;
    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  }

  return <div className="ibx-workspace">
    <PageHeader
      className="ibx-page-header"
      title="Inbox"
      description="Reply to Instagram DMs and keep an eye on Facebook Page comments."
      actions={<div className="ibx-channels" role="tablist" aria-label="Inbox channels">
        <button ref={(element) => { tabRefs.current.instagram = element; }} type="button" role="tab" id="instagram-tab" aria-controls="instagram-panel" aria-selected={active === "instagram"} tabIndex={active === "instagram" ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => select("instagram")}><InstagramGlyph size={16} />Instagram DMs</button>
        <button ref={(element) => { tabRefs.current.facebook = element; }} type="button" role="tab" id="facebook-tab" aria-controls="facebook-panel" aria-selected={active === "facebook"} tabIndex={active === "facebook" ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => select("facebook")}><FacebookGlyph size={16} />Facebook comments</button>
      </div>}
    />
    <div className="ibx-panel" role="tabpanel" id="instagram-panel" aria-labelledby="instagram-tab" hidden={active !== "instagram"}><InstagramInbox /></div>
    <div className="ibx-panel" role="tabpanel" id="facebook-panel" aria-labelledby="facebook-tab" hidden={active !== "facebook"}>{facebookOpened && <FacebookActivity />}</div>
  </div>;
}
