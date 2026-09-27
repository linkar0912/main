"use client";

import { useState } from "react";
import { FacebookActivity } from "./facebook-activity";
import { InstagramInbox } from "./instagram-inbox";
import { InstagramGlyph } from "../instagram-glyph";
import { FacebookGlyph } from "../facebook-glyph";
import { PageHeader } from "../page-header";

export function InboxWorkspace() {
  const [active, setActive] = useState<"instagram" | "facebook">("instagram");
  const [facebookOpened, setFacebookOpened] = useState(false);
  function selectFacebook() { setFacebookOpened(true); setActive("facebook"); }

  return <div className="ibx-workspace">
    <PageHeader
      className="ibx-page-header"
      title="Inbox"
      description="Reply to Instagram DMs and keep an eye on Facebook Page comments."
      actions={<div className="ibx-channels" role="tablist" aria-label="Inbox channels">
        <button type="button" role="tab" id="instagram-tab" aria-controls="instagram-panel" aria-selected={active === "instagram"} onClick={() => setActive("instagram")}><InstagramGlyph size={16} />Instagram DMs</button>
        <button type="button" role="tab" id="facebook-tab" aria-controls="facebook-panel" aria-selected={active === "facebook"} onClick={selectFacebook}><FacebookGlyph size={16} />Facebook comments</button>
      </div>}
    />
    <div className="ibx-panel" role="tabpanel" id="instagram-panel" aria-labelledby="instagram-tab" hidden={active !== "instagram"}><InstagramInbox /></div>
    <div className="ibx-panel" role="tabpanel" id="facebook-panel" aria-labelledby="facebook-tab" hidden={active !== "facebook"}>{facebookOpened && <FacebookActivity />}</div>
  </div>;
}
