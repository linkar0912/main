"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, CircleHelp, Link2, MessageCircle, Send } from "lucide-react";
import type { FlowAction, FlowCondition, FlowDefinition } from "@/src/lib/automation/types";

type AutomationBuilderProps = {
  automationId?: string;
  initialName?: string;
  initialDefinition?: FlowDefinition;
  onSaved?: (automation: unknown) => void;
};

const defaultDefinition: FlowDefinition = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Thanks for asking — I’ll send that over now." }],
};

function commaSeparated(values: string[]): string {
  return values.join(", ");
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AutomationBuilder({
  automationId,
  initialName = "",
  initialDefinition = defaultDefinition,
  onSaved,
}: AutomationBuilderProps) {
  const [name, setName] = useState(initialName);
  const [triggerType, setTriggerType] = useState<"comment" | "message">(initialDefinition.trigger.type);
  const [triggerMatch, setTriggerMatch] = useState<"keyword" | "any">(initialDefinition.trigger.match);
  const [keywords, setKeywords] = useState(commaSeparated(initialDefinition.trigger.keywords));
  const [mediaIds, setMediaIds] = useState(
    initialDefinition.trigger.type === "comment" ? commaSeparated(initialDefinition.trigger.mediaIds) : "",
  );
  const [conditionType, setConditionType] = useState<"none" | FlowCondition["type"]>(
    initialDefinition.conditions[0]?.type ?? "none",
  );
  const [conditionValue, setConditionValue] = useState(() => {
    const condition = initialDefinition.conditions[0];
    if (!condition) return "";
    return condition.type === "contains_keyword"
      ? commaSeparated(condition.keywords)
      : commaSeparated(condition.mediaIds);
  });
  const [actionType, setActionType] = useState<FlowAction["type"]>(initialDefinition.actions[0]?.type ?? "private_reply");
  const [messageText, setMessageText] = useState(initialDefinition.actions[0]?.text ?? "");
  const [linkUrl, setLinkUrl] = useState(() => {
    const action = initialDefinition.actions[0];
    return action?.type === "send_link" || action?.type === "send_button" ? action.url : "";
  });
  const [buttonLabel, setButtonLabel] = useState(() => {
    const action = initialDefinition.actions[0];
    return action?.type === "send_button" ? action.buttonLabel : "Open link";
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const actionOptions = useMemo(
    () =>
      triggerType === "comment"
        ? [
            { value: "private_reply", label: "Private reply", description: "Reply to the comment privately" },
            { value: "send_text", label: "Send a DM", description: "Start a direct message" },
            { value: "send_link", label: "Send a link", description: "Deliver a link in a DM" },
            { value: "send_button", label: "Send a button", description: "Deliver a tappable link" },
          ]
        : [
            { value: "send_text", label: "Send a DM", description: "Reply to the incoming message" },
            { value: "send_link", label: "Send a link", description: "Deliver a link in a DM" },
            { value: "send_button", label: "Send a button", description: "Deliver a tappable link" },
          ],
    [triggerType],
  );

  function changeTriggerType(value: "comment" | "message") {
    setTriggerType(value);
    if (value === "message" && actionType === "private_reply") setActionType("send_text");
  }

  function buildDefinition(): FlowDefinition {
    const trigger =
      triggerType === "comment"
        ? {
            type: "comment" as const,
            match: triggerMatch,
            keywords: triggerMatch === "keyword" ? parseCommaSeparated(keywords) : [],
            mediaIds: parseCommaSeparated(mediaIds),
          }
        : {
            type: "message" as const,
            match: triggerMatch,
            keywords: triggerMatch === "keyword" ? parseCommaSeparated(keywords) : [],
          };

    const conditions: FlowCondition[] =
      conditionType === "none"
        ? []
        : conditionType === "contains_keyword"
          ? [{ type: conditionType, keywords: parseCommaSeparated(conditionValue) }]
          : [{ type: conditionType, mediaIds: parseCommaSeparated(conditionValue) }];

    const action: FlowAction =
      actionType === "private_reply"
        ? { type: actionType, text: messageText }
        : actionType === "send_text"
          ? { type: actionType, text: messageText }
          : actionType === "send_link"
            ? { type: actionType, text: messageText, url: linkUrl }
            : { type: actionType, text: messageText, buttonLabel, url: linkUrl };

    return { version: 1, trigger, conditions, actions: [action] };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if (!name.trim()) {
      setError("Give this automation a name first.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(automationId ? `/api/automations/${automationId}` : "/api/automations", {
        method: automationId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, definition: buildDefinition() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not save this automation");
      setSaved(true);
      onSaved?.(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this automation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="builder-layout" onSubmit={save}>
      <div className="builder-main">
        <div className="builder-intro">
          <div>
            <p className="eyebrow">Guided builder</p>
            <h1>{automationId ? "Tune this automation" : "Build a reply flow"}</h1>
            <p className="muted">Choose one clear trigger, add a guardrail if you need it, then pick the reply.</p>
          </div>
          <div className="builder-version">Flow v1</div>
        </div>

        <label className="field field-wide">
          <span>Automation name</span>
          <input
            aria-label="Automation name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Send the creator guide"
            maxLength={120}
          />
        </label>

        <section className="flow-step">
          <div className="step-marker trigger-marker">01</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Trigger</p>
                <h2>When should DMSetu listen?</h2>
              </div>
              <MessageCircle size={21} strokeWidth={1.7} />
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Trigger source</span>
                <span className="select-wrap">
                  <select
                    aria-label="Trigger source"
                    value={triggerType}
                    onChange={(event) => changeTriggerType(event.target.value as "comment" | "message")}
                  >
                    <option value="comment">Instagram comment</option>
                    <option value="message">Instagram DM</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              <label className="field">
                <span>Match mode</span>
                <span className="select-wrap">
                  <select
                    aria-label="Match mode"
                    value={triggerMatch}
                    onChange={(event) => setTriggerMatch(event.target.value as "keyword" | "any")}
                  >
                    <option value="keyword">A keyword</option>
                    <option value="any">Any {triggerType === "comment" ? "comment" : "message"}</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
            </div>
            {triggerMatch === "keyword" && (
              <label className="field field-spaced">
                <span>Keywords</span>
                <input
                  aria-label="Keywords"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="guide, price, link"
                />
                <small>Separate multiple phrases with commas. Matching is case-insensitive.</small>
              </label>
            )}
            {triggerType === "comment" && (
              <label className="field field-spaced">
                <span>Limit to posts <em>optional</em></span>
                <input
                  aria-label="Post IDs"
                  value={mediaIds}
                  onChange={(event) => setMediaIds(event.target.value)}
                  placeholder="Paste Instagram media IDs, separated by commas"
                />
              </label>
            )}
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker condition-marker">02</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Condition <em>optional</em></p>
                <h2>Keep the audience precise</h2>
              </div>
              <CircleHelp size={21} strokeWidth={1.7} />
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Only continue if</span>
                <span className="select-wrap">
                  <select
                    aria-label="Condition type"
                    value={conditionType}
                    onChange={(event) => setConditionType(event.target.value as "none" | FlowCondition["type"])}
                  >
                    <option value="none">No extra condition</option>
                    <option value="contains_keyword">The text contains a keyword</option>
                    <option value="media_is">The post is one of these IDs</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              {conditionType !== "none" && (
                <label className="field">
                  <span>{conditionType === "contains_keyword" ? "Condition keywords" : "Post IDs"}</span>
                  <input
                    aria-label="Condition value"
                    value={conditionValue}
                    onChange={(event) => setConditionValue(event.target.value)}
                    placeholder="Separate values with commas"
                  />
                </label>
              )}
            </div>
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker action-marker">03</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Action</p>
                <h2>What should the person receive?</h2>
              </div>
              <Send size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Action type</span>
              <span className="select-wrap">
                <select
                  aria-label="Action type"
                  value={actionType}
                  onChange={(event) => setActionType(event.target.value as FlowAction["type"])}
                >
                  {actionOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </span>
              <small>{actionOptions.find((option) => option.value === actionType)?.description}</small>
            </label>
            <label className="field field-spaced">
              <span>Message text</span>
              <textarea
                aria-label="Message text"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                rows={3}
                placeholder="Write the exact message to send"
                maxLength={1_000}
              />
            </label>
            {(actionType === "send_link" || actionType === "send_button") && (
              <div className="field-grid field-spaced">
                <label className="field">
                  <span>Link URL</span>
                  <div className="input-with-icon"><Link2 size={16} /><input aria-label="Link URL" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://your-site.com/guide" /></div>
                </label>
                {actionType === "send_button" && (
                  <label className="field">
                    <span>Button label</span>
                    <input aria-label="Button label" value={buttonLabel} onChange={(event) => setButtonLabel(event.target.value)} placeholder="Open guide" />
                  </label>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="builder-footer">
          <div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {saved && <p className="form-success" role="status"><Check size={15} /> Saved to your workspace.</p>}
          </div>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : automationId ? "Save changes" : "Save automation"}
          </button>
        </div>
      </div>

      <aside className="builder-preview">
        <p className="eyebrow">Signal preview</p>
        <div className="preview-line" />
        <p className="preview-kicker">A person writes</p>
        <div className="preview-message">
          <span className="preview-avatar">P</span>
          <div>
            <strong>{triggerType === "comment" ? "“guide”" : "“price please”"}</strong>
            <small>{triggerType === "comment" ? "on your Instagram post" : "in Instagram DMs"}</small>
          </div>
        </div>
        <div className="preview-arrow"><ArrowRight size={18} /></div>
        <p className="preview-kicker">DMSetu sends</p>
        <div className="preview-message preview-response">
          <span className="preview-avatar preview-avatar-brand">D</span>
          <div>
            <strong>{messageText || "Your exact reply appears here"}</strong>
            {linkUrl && <small>{linkUrl}</small>}
          </div>
        </div>
        <div className="preview-note">
          <span className="signal-dot" />
          <span>No AI. Every reply follows your saved rule.</span>
        </div>
      </aside>
    </form>
  );
}
