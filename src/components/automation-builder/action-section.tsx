import { Plus, Trash2 } from "lucide-react";
import { Field } from "./wizard";

/** Extra versions of a Facebook Page's public reply (the first one is the action text). */
export function PublicPageReplyVariants({
  variants,
  onChange,
}: {
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
      <div className="builder-add-row">
        <button type="button" className="button button-secondary" disabled={variants.length >= 4} onClick={() => onChange([...variants, ""])}>
          <Plus size={16} /> {variants.length === 3 ? "Add a final version" : "Add another version"}
        </button>
        <p>Up to five. Linkar takes turns so your replies don’t look copy-pasted.</p>
      </div>
    </>
  );
}
