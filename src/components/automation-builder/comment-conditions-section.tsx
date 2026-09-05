export function CommentConditionsSection({
  mediaIds,
  replyOncePerUser,
  provider,
  onMediaIdsChange,
  onReplyOncePerUserChange,
}: {
  mediaIds: string;
  replyOncePerUser: boolean;
  provider: "INSTAGRAM" | "FACEBOOK";
  onMediaIdsChange: (value: string) => void;
  onReplyOncePerUserChange: (checked: boolean) => void;
}) {
  return (
    <>
      <label className="field field-spaced">
        <span>Limit to posts <em>optional</em></span>
        <input
          aria-label="Post IDs"
          value={mediaIds}
          onChange={(event) => onMediaIdsChange(event.target.value)}
          placeholder={provider === "FACEBOOK" ? "Paste Facebook post IDs, separated by commas" : "Paste Instagram media IDs, separated by commas"}
        />
      </label>
      <label className="field field-spaced checkbox-field">
        <input type="checkbox" aria-label="Reply once per person" checked={replyOncePerUser} onChange={(event) => onReplyOncePerUserChange(event.target.checked)} />
        <span>Reply once per person</span>
        <small>Stops this reply from being sent repeatedly to the same person.</small>
      </label>
    </>
  );
}
