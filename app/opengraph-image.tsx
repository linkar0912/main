import { ImageResponse } from "next/og";
import { PRODUCT_NAME } from "@/src/lib/branding";

// Generated once at build time and shared by every page that does not ship
// its own image.
export const alt = `${PRODUCT_NAME}: Instagram and Facebook automation, made clear`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          color: "#ffffff",
          background: "linear-gradient(145deg, #101116 0%, #101116 55%, #5f2ce0 82%, #c200bf 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              background: "#fa0cf7",
              color: "#101116",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            L
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>{PRODUCT_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2, maxWidth: 940 }}>
            Instagram and Facebook automation, made clear.
          </div>
          <div style={{ fontSize: 30, color: "#e7e5dc", maxWidth: 900 }}>
            Comment replies, DMs, and follow-ups for creators and businesses. Start free.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
