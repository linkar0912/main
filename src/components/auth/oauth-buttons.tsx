import { GoogleGlyph } from "@/src/components/google-glyph";
import { FacebookGlyph } from "@/src/components/facebook-glyph";

type OAuthButtonsProps = {
  next: string;
  invite?: string;
};

function ProviderForm({
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
  return (
    <form action={`/api/auth/oauth/${provider}`} method="post" className="oauth-form">
      <input type="hidden" name="next" value={next} />
      {invite && <input type="hidden" name="invite" value={invite} />}
      <button
        type="submit"
        className="button button-secondary button-block"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        {glyph}
        <span>Continue with {label}</span>
      </button>
    </form>
  );
}

export function OAuthButtons({ next, invite }: OAuthButtonsProps) {
  return (
    <div className="oauth-buttons">
      <ProviderForm provider="google" label="Google" glyph={<GoogleGlyph size={16} />} next={next} invite={invite} />
      <ProviderForm provider="facebook" label="Facebook" glyph={<FacebookGlyph size={16} brand />} next={next} invite={invite} />
    </div>
  );
}
