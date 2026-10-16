import { Plus, Trash2 } from "lucide-react";
import { Field } from "./wizard";

/** How many of these reply texts have something written in them. */
export function filledReplyCount(replies: readonly string[]): number {
  return replies.filter((reply) => reply.trim().length > 0).length;
}

/**
 * A gentle, non-blocking nudge when a public reply has only one wording. The
 * same text under every comment on a busy post reads as repetitive, so it
 * suggests a few versions. It never stops a save.
 */
export function ReplyVarietyHint({ replies }: { replies: readonly string[] }) {
  if (filledReplyCount(replies) !== 1) return null;
  return (
    <p className="builder-note" role="note">
      For posts that might get lots of comments, add 3 to 5 different wordings. The same reply under every comment can look repetitive.
    </p>
  );
}

/** Extra versions of a Facebook Page's public reply (the first one is the action text). */
export function PublicPageReplyVariants({
  firstReply,
  variants,
  onChange,
}: {
  firstReply: string;
  variants: string[];
  onChange: (variants: string[]) => void;
}) {
  return (
    <>
      {variants.map((variant, index) => (
        <div className="reply-version" key={index}>
          <Field label={`Reply ${index + 2}`}>
            <textarea
              value={variant}
              rows={2}
              maxLength={1_000}
              placeholder="Another way to say it"
              onChange={(event) => onChange(variants.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
            />
          </Field>
          <button type="button" className="icon-button" aria-label={`Remove reply ${index + 2}`} onClick={() => onChange(variants.filter((_, itemIndex) => itemIndex !== index))}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <ReplyVarietyHint replies={[firstReply, ...variants]} />
      <div className="builder-add-row">
        <button type="button" className="button button-secondary" disabled={variants.length >= 4} onClick={() => onChange([...variants, ""])}>
          <Plus size={16} /> {variants.length === 3 ? "Add a final version" : "Add another version"}
        </button>
        <p>Up to five. Linkar takes turns so your replies don’t look copy-pasted.</p>
      </div>
    </>
  );
}
