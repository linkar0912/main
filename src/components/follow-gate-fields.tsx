"use client";

import { Field } from "./automation-builder/wizard";

export type FollowGateFieldsProps = {
  notFollowingMessage: string;
  onNotFollowingMessageChange: (value: string) => void;
  recheckButtonLabel: string;
  onRecheckButtonLabelChange: (value: string) => void;
  notFollowingError?: string | null;
  recheckError?: string | null;
};

const LABEL_MAX_LENGTH = 20;

export function FollowGateFields({
  notFollowingMessage,
  onNotFollowingMessageChange,
  recheckButtonLabel,
  onRecheckButtonLabelChange,
  notFollowingError,
  recheckError,
}: FollowGateFieldsProps) {
  return (
    <>
      <Field
        label="Message for people who don’t follow you yet"
        hint="They follow you, then tap the button below to get the link."
        error={notFollowingError}
      >
        <textarea
          value={notFollowingMessage}
          onChange={(event) => onNotFollowingMessageChange(event.target.value)}
          rows={3}
          placeholder="This one’s for followers. Follow us, then tap the button below."
          maxLength={1_000}
        />
      </Field>
      <Field
        label="Button they tap after following"
        hint={`${recheckButtonLabel.length} of ${LABEL_MAX_LENGTH} characters`}
        error={recheckError}
        className="is-short"
      >
        <input
          value={recheckButtonLabel}
          onChange={(event) => onRecheckButtonLabelChange(event.target.value)}
          placeholder="I followed"
          maxLength={LABEL_MAX_LENGTH}
        />
      </Field>
    </>
  );
}
