"use client";

import { useState } from "react";
import { FacebookActivity } from "./facebook-activity";
import { InstagramInbox } from "./instagram-inbox";
import { InstagramGlyph } from "../instagram-glyph";
import { FacebookGlyph } from "../facebook-glyph";

export function InboxWorkspace() {
  const [active, setActive] = useState<"instagram" | "facebook">("instagram");
  const [facebookOpened, setFacebookOpened] = useState(false);
  function selectFacebook() { setFacebookOpened(true); setActive("facebook"); }
  return <div className="inbox-workspace">
    <div className="inbox-channel-bar">
      <div className="inbox-tabs" role="tablist" aria-label="Inbox channels">
        <button type="button" role="tab" id="instagram-tab" aria-controls="instagram-panel" aria-selected={active === "instagram"} onClick={() => setActive("instagram")}><InstagramGlyph size={17} />Instagram conversations</button>
        <button type="button" role="tab" id="facebook-tab" aria-controls="facebook-panel" aria-selected={active === "facebook"} onClick={selectFacebook}><FacebookGlyph size={17} />Facebook activity</button>
      </div>
      <span className="inbox-channel-note">Messages and comments, together</span>
    </div>
    <div role="tabpanel" id="instagram-panel" aria-labelledby="instagram-tab" tabIndex={active === "instagram" ? 0 : -1} hidden={active !== "instagram"}><InstagramInbox /></div>
    <div role="tabpanel" id="facebook-panel" aria-labelledby="facebook-tab" tabIndex={active === "facebook" ? 0 : -1} hidden={active !== "facebook"}>{facebookOpened && <FacebookActivity />}</div>
  </div>;
}
