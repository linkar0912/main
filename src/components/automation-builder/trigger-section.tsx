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
    <div className="field-grid field-spaced">
      <label className="field">
        <span>How should the words match?</span>
        <select aria-label="How should the words match?" value={mode} onChange={(event) => onModeChange(event.target.value as CommentKeywordMode)}>
          <option value="any">Any chosen word</option>
          <option value="all">All chosen words</option>
          <option value="contains">Contains phrase</option>
          <option value="exact">Exact comment</option>
          <option value="regex">Regular expression</option>
        </select>
      </label>
      <label className="field">
        <span>Words to ignore <em>optional</em></span>
        <input aria-label="Words to ignore" value={negativeKeywords} onChange={(event) => onNegativeKeywordsChange(event.target.value)} placeholder="spam, scam" />
      </label>
    </div>
  );
}
