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
        <span>Keyword logic</span>
        <select aria-label="Keyword logic" value={mode} onChange={(event) => onModeChange(event.target.value as CommentKeywordMode)}>
          <option value="any">Match any keyword</option>
          <option value="all">Require all keywords</option>
          <option value="contains">Contains phrase</option>
          <option value="exact">Exact comment</option>
          <option value="regex">Regular expression</option>
        </select>
      </label>
      <label className="field">
        <span>Exclude keywords <em>optional</em></span>
        <input aria-label="Exclude keywords" value={negativeKeywords} onChange={(event) => onNegativeKeywordsChange(event.target.value)} placeholder="spam, scam" />
      </label>
    </div>
  );
}
