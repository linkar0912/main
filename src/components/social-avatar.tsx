"use client";

import { useState } from "react";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";

export function SocialAvatar({
  channel,
  name,
  src,
  size = "medium",
}: {
  channel: "instagram" | "facebook";
  name: string;
  src?: string;
  size?: "small" | "medium" | "large";
}) {
  const [failedSrc, setFailedSrc] = useState<string>();

  return (
    <span className={`social-avatar is-${channel} is-${size}`}>
      {src && failedSrc !== src ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated avatar routes redirect to short-lived Meta CDN images.
        <img
          src={src}
          alt={`${name} profile photo`}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="social-avatar-fallback" aria-hidden="true">
          {channel === "instagram" ? <InstagramGlyph size={size === "large" ? 24 : 18} brand /> : <FacebookGlyph size={size === "large" ? 24 : 18} brand />}
        </span>
      )}
    </span>
  );
}
