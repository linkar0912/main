"use client";

import { useState } from "react";
import { FacebookActivity } from "./facebook-activity";
import { InstagramInbox } from "./instagram-inbox";

export function InboxWorkspace() {
  const [active, setActive] = useState<"instagram" | "facebook">("instagram");
  return <div className="inbox-workspace">
    <div className="inbox-tabs" role="tablist" aria-label="Inbox channels">
      <button type="button" role="tab" id="instagram-tab" aria-controls="instagram-panel" aria-selected={active === "instagram"} onClick={() => setActive("instagram")}>Instagram conversations</button>
      <button type="button" role="tab" id="facebook-tab" aria-controls="facebook-panel" aria-selected={active === "facebook"} onClick={() => setActive("facebook")}>Facebook activity</button>
    </div>
    <div role="tabpanel" id={`${active}-panel`} aria-labelledby={`${active}-tab`}>
      {active === "instagram" ? <InstagramInbox /> : <FacebookActivity />}
    </div>
  </div>;
}
