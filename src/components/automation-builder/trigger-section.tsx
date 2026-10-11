import { Field } from "./wizard";

export type CommentKeywordMode = "any" | "all" | "exact" | "regex" | "contains";

export function CommentKeywordControls({
  mode,
  negativeKeywords,
  onModeChange,
  onNegativeKeywordsChange,
}: {
  mode: CommentKeywordMode;
  negativeKeywords: string;
  onModeChange: (mode: CommentKeywordMode) => void;
  onNegativeKeywordsChange: (value: string) => void;
}) {
  return (
    <div className="builder-field-row">
      <Field label="How should the words match?">
        <select value={mode} onChange={(event) => onModeChange(event.target.value as CommentKeywordMode)}>
          <option value="any">Any one of the words</option>
          <option value="all">All of the words</option>
          <option value="contains">The words as one phrase</option>
          <option value="exact">The whole comment, exactly</option>
          <option value="regex">Advanced pattern (regex)</option>
        </select>
      </Field>
      <Field label="Words to ignore" optional hint="Comments with these words get no reply.">
        <input value={negativeKeywords} onChange={(event) => onNegativeKeywordsChange(event.target.value)} placeholder="spam, scam" />
      </Field>
    </div>
  );
}
