import { useState } from "react";
import { MediaPicker, type MediaPickerProps } from "../media-picker";
import { ChoiceCards, Field, ToggleRow } from "./wizard";

/**
 * Which posts a comment reply listens on. "Any post" saves an empty list;
 * choosing posts opens the same thumbnail picker as the campaign builder
 * (Facebook has no picker, so it takes pasted post IDs).
 */
export function CommentPostsField({
  mediaIds,
  provider,
  onMediaIdsChange,
  onMediaIndexChange,
}: {
  mediaIds: string;
  provider: "INSTAGRAM" | "FACEBOOK";
  onMediaIdsChange: (value: string) => void;
  onMediaIndexChange?: MediaPickerProps["onIndexChange"];
}) {
  const selectedIds = mediaIds.split(",").map((id) => id.trim()).filter(Boolean);
  const [limited, setLimited] = useState(selectedIds.length > 0);
  return (
    <>
      <ChoiceCards
        legend="On which posts?"
        name="comment-post-scope"
        className="is-compact"
        value={limited ? "some" : "all"}
        onChange={(value) => {
          setLimited(value === "some");
          // "Any post" is an empty list - drop a half-made selection.
          if (value === "all") onMediaIdsChange("");
        }}
        options={[
          { value: "all", label: "Any post", description: "Including posts you publish later" },
          { value: "some", label: "Only posts I choose", description: provider === "INSTAGRAM" ? "Pick posts and Reels" : "Paste the post IDs" },
        ]}
      />
      {limited && provider === "INSTAGRAM" && (
        <MediaPicker
          selectedIds={selectedIds}
          onIndexChange={onMediaIndexChange}
          onChange={(ids) => onMediaIdsChange(ids.join(", "))}
        />
      )}
      {limited && provider === "FACEBOOK" && (
        <Field label="Post IDs" hint="Separate several with commas. A post’s ID is the number at the end of its link.">
          <input
            value={mediaIds}
            onChange={(event) => onMediaIdsChange(event.target.value)}
            placeholder="e.g. 1234567890123456"
          />
        </Field>
      )}
    </>
  );
}

export function ReplyOncePerPersonToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <ToggleRow
      label="Reply once per person"
      hint="Someone who comments again gets no second reply."
      checked={checked}
      onChange={onChange}
    />
  );
}
