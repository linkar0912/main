"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Film,
  Link2,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import type { FlowAction, FlowCondition, FlowDefinition, FlowDefinitionV1, FlowDefinitionV2, MediaSnapshot } from "@/src/lib/automation/types";
import { PRODUCT_MARK } from "@/src/lib/branding";
import { MediaPicker } from "./media-picker";
import { FollowGateFields } from "./follow-gate-fields";

type AutomationBuilderProps = {
  automationId?: string;
  initialName?: string;
  initialDefinition?: FlowDefinition;
  onSaved?: (automation: unknown) => void;
};

const QUICK_REPLY_LABEL_MAX_LENGTH = 20;
const MAX_PUBLIC_REPLIES = 5;

function commaSeparated(values: string[]): string {
  return values.join(", ");
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Legacy single-response flow. Kept unchanged so existing version 1 automations remain editable. */
const defaultDefinitionV1: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Thanks for asking — I’ll send that over now." }],
};

function AutomationBuilderV1({
  automationId,
  initialName = "",
  initialDefinition = defaultDefinitionV1,
  onSaved,
}: {
  automationId?: string;
  initialName?: string;
  initialDefinition?: FlowDefinitionV1;
  onSaved?: (automation: unknown) => void;
}) {
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
    if (value === "comment") setActionType("private_reply");
  }

  function buildDefinition(): FlowDefinitionV1 {
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
                <h2>When should ReplyConnect listen?</h2>
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
        <p className="preview-kicker">ReplyConnect sends</p>
        <div className="preview-message preview-response">
          <span className="preview-avatar preview-avatar-brand">{PRODUCT_MARK}</span>
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

type MediaSource = "specific_media" | "all_media" | "next_media";

const defaultDefinitionV2: FlowDefinitionV2 = {
  version: 2,
  trigger: { type: "comment", source: "specific_media", mediaIds: [], mediaSnapshots: [], match: "keyword", keywords: [] },
  publicReplies: [""],
  openingMessage: { text: "", optInButtonLabel: "Get it" },
  followGate: { required: true, notFollowingMessage: "", recheckButtonLabel: "I followed" },
  delivery: { text: "", url: "", buttonLabel: "" },
};

const PREVIEW_STEPS = ["Comment", "Opening message", "Not following", "Delivery"] as const;

function isLocalDeliveryUrl(url: URL): boolean {
  return url.protocol === "http:" && url.hostname === "localhost";
}

function AutomationBuilderV2({
  automationId,
  initialName = "",
  initialDefinition = defaultDefinitionV2,
  onSaved,
}: {
  automationId?: string;
  initialName?: string;
  initialDefinition?: FlowDefinitionV2;
  onSaved?: (automation: unknown) => void;
}) {
  const [name, setName] = useState(initialName);
  const [savedAutomationId, setSavedAutomationId] = useState(automationId);
  const [source, setSource] = useState<MediaSource>(initialDefinition.trigger.source);
  const [mediaIds, setMediaIds] = useState<string[]>(initialDefinition.trigger.mediaIds);
  const [mediaSnapshots, setMediaSnapshots] = useState<MediaSnapshot[]>(initialDefinition.trigger.mediaSnapshots);
  const [match, setMatch] = useState<"keyword" | "any">(initialDefinition.trigger.match);
  const [keywords, setKeywords] = useState(commaSeparated(initialDefinition.trigger.keywords));
  const [publicReplies, setPublicReplies] = useState<string[]>(
    initialDefinition.publicReplies.length > 0 ? initialDefinition.publicReplies : [""],
  );
  const [openingText, setOpeningText] = useState(initialDefinition.openingMessage.text);
  const [optInButtonLabel, setOptInButtonLabel] = useState(initialDefinition.openingMessage.optInButtonLabel);
  const [notFollowingMessage, setNotFollowingMessage] = useState(initialDefinition.followGate.notFollowingMessage);
  const [recheckButtonLabel, setRecheckButtonLabel] = useState(initialDefinition.followGate.recheckButtonLabel);
  const [deliveryText, setDeliveryText] = useState(initialDefinition.delivery.text);
  const [deliveryUrl, setDeliveryUrl] = useState(initialDefinition.delivery.url);
  const [deliveryButtonLabel, setDeliveryButtonLabel] = useState(initialDefinition.delivery.buttonLabel ?? "");
  const [previewStep, setPreviewStep] = useState(0);
  const [pendingIntent, setPendingIntent] = useState<"draft" | "activate" | null>(null);
  const [savedIntent, setSavedIntent] = useState<"draft" | "activate" | null>(null);
  const [error, setError] = useState("");

  function changeSource(value: MediaSource) {
    setSource(value);
    if (value !== "specific_media") {
      setMediaIds([]);
      setMediaSnapshots([]);
    }
  }

  function updateReply(index: number, value: string) {
    setPublicReplies((current) => current.map((reply, replyIndex) => (replyIndex === index ? value : reply)));
  }

  function addReply() {
    setPublicReplies((current) => (current.length >= MAX_PUBLIC_REPLIES ? current : [...current, ""]));
  }

  function removeReply(index: number) {
    setPublicReplies((current) => current.filter((_, replyIndex) => replyIndex !== index));
  }

  function buildDefinition(): FlowDefinitionV2 {
    return {
      version: 2,
      trigger: {
        type: "comment",
        source,
        mediaIds: source === "specific_media" ? mediaIds : [],
        mediaSnapshots: source === "specific_media" ? mediaSnapshots : [],
        match,
        keywords: match === "keyword" ? parseCommaSeparated(keywords) : [],
      },
      publicReplies: publicReplies.map((reply) => reply.trim()).filter(Boolean),
      openingMessage: { text: openingText.trim(), optInButtonLabel: optInButtonLabel.trim() },
      followGate: { required: true, notFollowingMessage: notFollowingMessage.trim(), recheckButtonLabel: recheckButtonLabel.trim() },
      delivery: {
        text: deliveryText.trim(),
        url: deliveryUrl.trim(),
        ...(deliveryButtonLabel.trim() ? { buttonLabel: deliveryButtonLabel.trim() } : {}),
      },
    };
  }

  function validate(): string | null {
    if (!name.trim()) return "Give this automation a name first.";
    if (source === "specific_media" && mediaIds.length === 0) return "Select at least one post or Reel to watch.";
    if (match === "keyword" && parseCommaSeparated(keywords).length === 0) return "Add at least one keyword.";
    if (publicReplies.map((reply) => reply.trim()).filter(Boolean).length > MAX_PUBLIC_REPLIES) {
      return `Use up to ${MAX_PUBLIC_REPLIES} public reply variations.`;
    }
    if (optInButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
    if (recheckButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
    if (!deliveryUrl.trim()) return "Add a delivery link.";
    try {
      const url = new URL(deliveryUrl.trim());
      if (url.protocol !== "https:" && !isLocalDeliveryUrl(url)) return "Delivery links must use HTTPS.";
    } catch {
      return "Enter a valid delivery URL.";
    }
    return null;
  }

  async function save(intent: "draft" | "activate") {
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setPendingIntent(intent);
    try {
      const response = await fetch(savedAutomationId ? `/api/automations/${savedAutomationId}` : "/api/automations", {
        method: savedAutomationId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, definition: buildDefinition() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save this automation");
      setSavedAutomationId(payload.data.id);

      if (intent === "activate") {
        const activateResponse = await fetch(`/api/automations/${payload.data.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        });
        const activatePayload = (await activateResponse.json().catch(() => ({}))) as { data?: unknown; error?: string };
        if (!activateResponse.ok) throw new Error(activatePayload.error ?? "Saved as a draft, but activation failed.");
        onSaved?.(activatePayload.data);
      } else {
        onSaved?.(payload.data);
      }
      setSavedIntent(intent);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this automation");
    } finally {
      setPendingIntent(null);
    }
  }

  const keywordList = parseCommaSeparated(keywords);
  const nonEmptyReplies = publicReplies.map((reply) => reply.trim()).filter(Boolean);
  const sourceSummary =
    source === "specific_media"
      ? mediaIds.length > 0
        ? `${mediaIds.length} selected post${mediaIds.length === 1 ? "" : "s"}`
        : "no post selected yet"
      : source === "all_media"
        ? "all of your posts"
        : "the next post you publish";

  return (
    <div className="builder-layout">
      <div className="builder-main">
        <div className="builder-intro">
          <div>
            <p className="eyebrow">Guided builder</p>
            <h1>{savedAutomationId ? "Tune this campaign" : "Build a follow-gated Reel campaign"}</h1>
            <p className="muted">A public reply, a DM opt-in, a follow check, and a verified link — every step explicit.</p>
          </div>
          <div className="builder-version">Flow v2</div>
        </div>

        <label className="field field-wide">
          <span>Automation name</span>
          <input
            aria-label="Automation name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Reel giveaway follow gate"
            maxLength={120}
          />
        </label>

        <section className="flow-step">
          <div className="step-marker trigger-marker">01</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Content</p>
                <h2>Which posts should ReplyConnect watch?</h2>
              </div>
              <Film size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Trigger source</span>
              <span className="select-wrap">
                <select aria-label="Trigger source" value={source} onChange={(event) => changeSource(event.target.value as MediaSource)}>
                  <option value="specific_media">Specific posts or Reels</option>
                  <option value="all_media">All of my posts</option>
                  <option value="next_media">The next post I publish</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
            {source === "specific_media" && (
              <div className="field-spaced">
                <MediaPicker
                  selectedIds={mediaIds}
                  onChange={(ids, snapshots) => {
                    setMediaIds(ids);
                    setMediaSnapshots(snapshots);
                  }}
                />
              </div>
            )}
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker condition-marker">02</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Trigger</p>
                <h2>What comment starts this campaign?</h2>
              </div>
              <MessageCircle size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Match mode</span>
              <span className="select-wrap">
                <select aria-label="Match mode" value={match} onChange={(event) => setMatch(event.target.value as "keyword" | "any")}>
                  <option value="keyword">A keyword</option>
                  <option value="any">Any comment</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
            {match === "keyword" && (
              <label className="field field-spaced">
                <span>Keywords</span>
                <input
                  aria-label="Keywords"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="drop, giveaway, price"
                />
                <small>Separate multiple phrases with commas. Matching is case-insensitive.</small>
              </label>
            )}
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker action-marker">03</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Public reply <em>up to 5 variations</em></p>
                <h2>What public reply should ReplyConnect post?</h2>
              </div>
              <Send size={21} strokeWidth={1.7} />
            </div>
            {publicReplies.map((reply, index) => (
              <div className="field field-spaced public-reply-row" key={index}>
                <span>Variation {index + 1}</span>
                <div className="public-reply-input">
                  <textarea
                    aria-label={`Public reply variation ${index + 1}`}
                    value={reply}
                    onChange={(event) => updateReply(index, event.target.value)}
                    rows={2}
                    maxLength={1_000}
                    placeholder="Write the exact public comment to post"
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove variation ${index + 1}`}
                    onClick={() => removeReply(index)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary field-spaced"
              onClick={addReply}
              disabled={publicReplies.length >= MAX_PUBLIC_REPLIES}
            >
              <Plus size={15} /> Add variation
            </button>
            <small>ReplyConnect rotates between variations so the same public comment doesn’t repeat.</small>
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker trigger-marker">04</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Opening DM</p>
                <h2>Send an opening message that asks for consent</h2>
              </div>
              <UserCheck size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Opening message text</span>
              <textarea
                aria-label="Opening message text"
                value={openingText}
                onChange={(event) => setOpeningText(event.target.value)}
                rows={3}
                maxLength={1_000}
                placeholder="Explain what they’ll get and invite them to tap the button below"
              />
            </label>
            <label className="field field-spaced">
              <span>Opt-in button label</span>
              <input
                aria-label="Opt-in button label"
                value={optInButtonLabel}
                onChange={(event) => setOptInButtonLabel(event.target.value)}
                maxLength={QUICK_REPLY_LABEL_MAX_LENGTH}
                placeholder="Get it"
              />
              <small>{optInButtonLabel.length}/{QUICK_REPLY_LABEL_MAX_LENGTH} characters</small>
            </label>
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker condition-marker">05</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Follow gate</p>
                <h2>Require a follow before the link unlocks</h2>
              </div>
              <ShieldCheck size={21} strokeWidth={1.7} />
            </div>
            <FollowGateFields
              notFollowingMessage={notFollowingMessage}
              onNotFollowingMessageChange={setNotFollowingMessage}
              recheckButtonLabel={recheckButtonLabel}
              onRecheckButtonLabelChange={setRecheckButtonLabel}
            />
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker action-marker">06</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Delivery</p>
                <h2>What do you deliver once someone is verified?</h2>
              </div>
              <Link2 size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Delivery message</span>
              <textarea
                aria-label="Delivery message"
                value={deliveryText}
                onChange={(event) => setDeliveryText(event.target.value)}
                rows={2}
                maxLength={1_000}
                placeholder="The exact message sent once someone is verified"
              />
            </label>
            <div className="field-grid field-spaced">
              <label className="field">
                <span>Delivery link</span>
                <div className="input-with-icon">
                  <Link2 size={16} />
                  <input
                    aria-label="Delivery link"
                    value={deliveryUrl}
                    onChange={(event) => setDeliveryUrl(event.target.value)}
                    placeholder="https://your-site.com/prize"
                  />
                </div>
                <small>HTTPS required. http://localhost is permitted while developing.</small>
              </label>
              <label className="field">
                <span>Delivery button label <em>optional</em></span>
                <input
                  aria-label="Delivery button label"
                  value={deliveryButtonLabel}
                  onChange={(event) => setDeliveryButtonLabel(event.target.value)}
                  maxLength={80}
                  placeholder="Open link"
                />
              </label>
            </div>
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step review-step">
          <div className="step-marker trigger-marker">07</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Review</p>
                <h2>Review before you save</h2>
              </div>
              <Check size={21} strokeWidth={1.7} />
            </div>
            <ul className="review-summary" data-testid="review-summary">
              <li>Watching {sourceSummary}</li>
              <li>Triggered by {match === "keyword" ? (keywordList.length ? `a comment containing “${keywordList.join("”, “")}”` : "a keyword (add one below)") : "any comment"}</li>
              <li>{nonEmptyReplies.length || "No"} public reply variation{nonEmptyReplies.length === 1 ? "" : "s"} ready</li>
              <li>Opening DM asks for a follow before delivering anything</li>
              <li>Recheck button reads “{recheckButtonLabel || "add a label"}”</li>
              <li>Verified followers land on {deliveryUrl || "no link yet"}</li>
            </ul>
          </div>
        </section>

        <div className="builder-footer">
          <div>
            {error && <p className="form-error" role="alert">{error}</p>}
            {!error && savedIntent && (
              <p className="form-success" role="status">
                <Check size={15} /> {savedIntent === "activate" ? "Saved and activated." : "Saved to your workspace."}
              </p>
            )}
          </div>
          <div className="builder-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void save("draft")}
              disabled={pendingIntent !== null}
            >
              {pendingIntent === "draft" ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void save("activate")}
              disabled={pendingIntent !== null}
            >
              {pendingIntent === "activate" ? "Activating…" : "Save & activate"}
            </button>
          </div>
        </div>
      </div>

      <aside className="builder-preview" aria-label="Test preview">
        <p className="eyebrow">Test preview <span className="preview-disclaimer">— not sent to Instagram</span></p>
        <div className="preview-line" />
        <div className="preview-steps-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous preview step"
            onClick={() => setPreviewStep((step) => Math.max(0, step - 1))}
            disabled={previewStep === 0}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="preview-step-label">{PREVIEW_STEPS[previewStep]}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next preview step"
            onClick={() => setPreviewStep((step) => Math.min(PREVIEW_STEPS.length - 1, step + 1))}
            disabled={previewStep === PREVIEW_STEPS.length - 1}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {previewStep === 0 && (
          <div className="message-step-preview">
            <p className="preview-kicker">A person comments</p>
            <div className="preview-message">
              <span className="preview-avatar">P</span>
              <div>
                <strong>{match === "keyword" ? `“${keywordList[0] ?? "your keyword"}”` : "any comment"}</strong>
                <small>on your post</small>
              </div>
            </div>
            <div className="preview-arrow"><ArrowRight size={18} /></div>
            <p className="preview-kicker">ReplyConnect replies publicly</p>
            <div className="preview-message preview-response">
              <span className="preview-avatar preview-avatar-brand">{PRODUCT_MARK}</span>
              <div><strong>{nonEmptyReplies[0] || "Add a public reply variation"}</strong></div>
            </div>
          </div>
        )}

        {previewStep === 1 && (
          <div className="message-step-preview">
            <p className="preview-kicker">ReplyConnect DMs them</p>
            <div className="preview-message preview-response">
              <span className="preview-avatar preview-avatar-brand">{PRODUCT_MARK}</span>
              <div>
                <strong>{openingText || "Add your opening message"}</strong>
                <small>Button: {optInButtonLabel || "add a label"}</small>
              </div>
            </div>
          </div>
        )}

        {previewStep === 2 && (
          <div className="message-step-preview">
            <p className="preview-kicker">If they haven’t followed yet</p>
            <div className="preview-message preview-response">
              <span className="preview-avatar preview-avatar-brand">{PRODUCT_MARK}</span>
              <div>
                <strong>{notFollowingMessage || "Add your not-following prompt"}</strong>
                <small>Button: {recheckButtonLabel || "add a label"}</small>
              </div>
            </div>
          </div>
        )}

        {previewStep === 3 && (
          <div className="message-step-preview">
            <p className="preview-kicker">Once they’re verified</p>
            <div className="preview-message preview-response">
              <span className="preview-avatar preview-avatar-brand">{PRODUCT_MARK}</span>
              <div>
                <strong>{deliveryText || "Add your delivery message"}</strong>
                {deliveryUrl && <small>{deliveryUrl}</small>}
              </div>
            </div>
          </div>
        )}

        <div className="preview-note">
          <span className="signal-dot" />
          <span>No AI. Preview only — nothing here is sent to Instagram.</span>
        </div>
      </aside>
    </div>
  );
}

export function AutomationBuilder({ automationId, initialName, initialDefinition, onSaved }: AutomationBuilderProps) {
  if (initialDefinition?.version === 1) {
    return (
      <AutomationBuilderV1
        automationId={automationId}
        initialName={initialName}
        initialDefinition={initialDefinition}
        onSaved={onSaved}
      />
    );
  }
  return (
    <AutomationBuilderV2
      automationId={automationId}
      initialName={initialName}
      initialDefinition={initialDefinition}
      onSaved={onSaved}
    />
  );
}
