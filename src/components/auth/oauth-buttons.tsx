import { GoogleGlyph } from "@/src/components/google-glyph";
import { FacebookGlyph } from "@/src/components/facebook-glyph";

type OAuthButtonsProps = {
  next: string;
  invite?: string;
};

// Google talks to Google directly (see src/lib/auth/google-oauth.ts) so its
// consent screen shows our own domain; Facebook still goes through
// Supabase's hosted relay at /api/auth/oauth/facebook.
const START_PATH = {
  google: "/api/auth/oauth/google/start",
  facebook: "/api/auth/oauth/facebook",
} as const;

function ProviderLink({
  provider,
  label,
  glyph,
  next,
  invite,
}: {
  provider: "google" | "facebook";
  label: string;
  glyph: React.ReactNode;
  next: string;
  invite?: string;
}) {
  const params = new URLSearchParams({ next });
  if (invite) params.set("invite", invite);
  return (
    <a
      href={`${START_PATH[provider]}?${params.toString()}`}
      className="button button-secondary button-block"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
    >
      {glyph}
      <span>Continue with {label}</span>
    </a>
  );
}

export function OAuthButtons({ next, invite }: OAuthButtonsProps) {
  return (
    <div className="oauth-buttons">
      <ProviderLink provider="google" label="Google" glyph={<GoogleGlyph size={16} />} next={next} invite={invite} />
      <ProviderLink provider="facebook" label="Facebook" glyph={<FacebookGlyph size={16} brand />} next={next} invite={invite} />
    </div>
  );
}
