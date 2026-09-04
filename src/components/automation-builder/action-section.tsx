import { Plus, Trash2 } from "lucide-react";

export function PublicPageReplyVariants({
  variants,
  onChange,
}: {
  variants: string[];
  onChange: (variants: string[]) => void;
}) {
  return (
    <div className="field-spaced">
      {variants.map((variant, index) => (
        <div className="public-reply-row" key={index}>
          <label className="field public-reply-input">
            <span>Variation {index + 2}</span>
            <textarea
              aria-label={`Public Page reply variation ${index + 2}`}
              value={variant}
              rows={3}
              maxLength={1_000}
              onChange={(event) => onChange(variants.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
            />
          </label>
          <button type="button" className="icon-button" aria-label={`Remove reply variation ${index + 2}`} onClick={() => onChange(variants.filter((_, itemIndex) => itemIndex !== index))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" className="button button-secondary" disabled={variants.length >= 4} onClick={() => onChange([...variants, ""])}>
        <Plus size={15} /> {variants.length === 3 ? "Add final reply variation" : "Add reply variation"}
      </button>
      <small>Linkar rotates up to five public replies to keep responses natural.</small>
    </div>
  );
}
