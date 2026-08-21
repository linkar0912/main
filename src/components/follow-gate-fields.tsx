"use client";

export type FollowGateFieldsProps = {
  notFollowingMessage: string;
  onNotFollowingMessageChange: (value: string) => void;
  recheckButtonLabel: string;
  onRecheckButtonLabelChange: (value: string) => void;
};

const LABEL_MAX_LENGTH = 20;

export function FollowGateFields({
  notFollowingMessage,
  onNotFollowingMessageChange,
  recheckButtonLabel,
  onRecheckButtonLabelChange,
}: FollowGateFieldsProps) {
  return (
    <div className="field-grid">
      <label className="field field-wide">
        <span>Not-following prompt</span>
        <textarea
          aria-label="Not-following prompt"
          value={notFollowingMessage}
          onChange={(event) => onNotFollowingMessageChange(event.target.value)}
          rows={3}
          placeholder="Shown when someone taps the opt-in button before they follow you"
          maxLength={1_000}
        />
        <small>Sent only to people who have not followed yet. They must follow, then recheck to unlock delivery.</small>
      </label>
      <label className="field">
        <span>Recheck button label</span>
        <input
          aria-label="Recheck button label"
          value={recheckButtonLabel}
          onChange={(event) => onRecheckButtonLabelChange(event.target.value)}
          placeholder="I followed"
          maxLength={LABEL_MAX_LENGTH}
        />
        <small>{recheckButtonLabel.length}/{LABEL_MAX_LENGTH} characters</small>
      </label>
    </div>
  );
}
