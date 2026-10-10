import { MediaPicker, type MediaPickerProps } from "../media-picker";

export function CommentConditionsSection({
  mediaIds,
  replyOncePerUser,
  provider,
  onMediaIdsChange,
  onReplyOncePerUserChange,
  onMediaIndexChange,
}: {
  mediaIds: string;
  replyOncePerUser: boolean;
  provider: "INSTAGRAM" | "FACEBOOK";
  onMediaIdsChange: (value: string) => void;
  onReplyOncePerUserChange: (checked: boolean) => void;
  onMediaIndexChange?: MediaPickerProps["onIndexChange"];
}) {
  const selectedIds = mediaIds.split(",").map((id) => id.trim()).filter(Boolean);
  return (
    <>
      {provider === "INSTAGRAM" ? (
        // Same picker as the campaign builder: choose posts by thumbnail
        // instead of pasting raw media IDs.
        <div className="field field-spaced">
          <span>Limit to posts <em>optional - leave empty for every post</em></span>
          <MediaPicker
            selectedIds={selectedIds}
            onIndexChange={onMediaIndexChange}
            onChange={(ids) => onMediaIdsChange(ids.join(", "))}
          />
        </div>
      ) : (
        <label className="field field-spaced">
          <span>Limit to posts <em>optional</em></span>
          <input
            aria-label="Post IDs"
            value={mediaIds}
            onChange={(event) => onMediaIdsChange(event.target.value)}
            placeholder="Paste Facebook post IDs, separated by commas"
          />
        </label>
      )}
      <label className="field field-spaced checkbox-field">
        <input type="checkbox" aria-label="Reply once per person" checked={replyOncePerUser} onChange={(event) => onReplyOncePerUserChange(event.target.checked)} />
        <span>Reply once per person</span>
        <small>Stops this reply from being sent repeatedly to the same person.</small>
      </label>
    </>
  );
}
