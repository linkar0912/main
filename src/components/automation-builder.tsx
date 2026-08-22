"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Film,
  Link2,
  Mail,
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

/**
 * Parses a comma-separated keyword field and drops case-insensitive duplicates, keeping the
 * first occurrence. The server normalizes keywords the same way (trim + lowercase) and rejects
 * the whole request with a raw Zod error if duplicates remain after normalization — deduping
 * here client-side avoids surfacing that confusing error for something like "Guide, guide".
 */
function parseKeywords(value: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const keyword of parseCommaSeparated(value)) {
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

/** Classic single/multi-response flow: comment, DM, referral, and opt-in triggers. */
const defaultDefinitionV1: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Thanks for asking — I’ll send that over now." }],
};

type ClassicTriggerType = FlowDefinitionV1["trigger"]["type"];
const MAX_CLASSIC_ACTIONS = 3;

function classicActionOptions(trigger: ClassicTriggerType): { value: FlowAction["type"]; label: string; description: string }[] {
  if (trigger === "comment") {
    return [{ value: "private_reply", label: "Private reply", description: "Reply to the comment privately" }];
  }
  return [
    { value: "send_text", label: "Send a DM", description: "Send a plain text message" },
    { value: "send_link", label: "Send a link", description: "Deliver a link in a DM" },
    { value: "send_button", label: "Send a button", description: "Deliver a tappable link" },
  ];
}

function newClassicAction(type: FlowAction["type"]): FlowAction {
  if (type === "private_reply") return { type, text: "" };
  if (type === "send_text") return { type, text: "" };
  if (type === "send_link") return { type, text: "", url: "" };
  return { type, text: "", buttonLabel: "Open link", url: "" };
}

/** datetime-local inputs produce "" or "YYYY-MM-DDTHH:mm" in the local zone. */
function localInputToIso(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function isoToLocalInput(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  const [triggerType, setTriggerType] = useState<ClassicTriggerType>(initialDefinition.trigger.type);
  const [triggerMatch, setTriggerMatch] = useState<"keyword" | "any">(
    initialDefinition.trigger.type === "comment" || initialDefinition.trigger.type === "message"
      ? initialDefinition.trigger.match
      : "keyword",
  );
  const [keywords, setKeywords] = useState(
    initialDefinition.trigger.type === "comment" || initialDefinition.trigger.type === "message"
      ? commaSeparated(initialDefinition.trigger.keywords)
      : "",
  );
  const [mediaIds, setMediaIds] = useState(
    initialDefinition.trigger.type === "comment" ? commaSeparated(initialDefinition.trigger.mediaIds) : "",
  );
  const [conditionType, setConditionType] = useState<"" | FlowCondition["type"]>(
    initialDefinition.conditions[0]?.type ?? "",
  );
  const [conditionValue, setConditionValue] = useState(() => {
    const condition = initialDefinition.conditions[0];
    if (!condition) return "";
    return condition.type === "contains_keyword"
      ? commaSeparated(condition.keywords)
      : commaSeparated(condition.mediaIds);
  });
  const [actions, setActions] = useState<FlowAction[]>(() =>
    initialDefinition.actions.length > 0 ? initialDefinition.actions : [newClassicAction("private_reply")],
  );
  const [emailCaptureEnabled, setEmailCaptureEnabled] = useState(Boolean(initialDefinition.emailCapture));
  const [emailPrompt, setEmailPrompt] = useState(initialDefinition.emailCapture?.promptText ?? "");
  const [emailRetry, setEmailRetry] = useState(initialDefinition.emailCapture?.retryText ?? "");
  const [emailConfirmation, setEmailConfirmation] = useState(initialDefinition.emailCapture?.confirmationText ?? "");
  const [scheduleStart, setScheduleStart] = useState(isoToLocalInput(initialDefinition.schedule?.startsAt));
  const [scheduleEnd, setScheduleEnd] = useState(isoToLocalInput(initialDefinition.schedule?.endsAt));
  const [dailyLimit, setDailyLimit] = useState(initialDefinition.dailySendLimit ? String(initialDefinition.dailySendLimit) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const usesTextTrigger = triggerType === "comment" || triggerType === "message";
  const allowedActionTypes = classicActionOptions(triggerType);

  function updateAction(index: number, patch: Partial<FlowAction>) {
    setActions((current) => current.map((action, actionIndex) => {
      if (actionIndex !== index) return action;
      return { ...action, ...patch } as FlowAction;
    }));
  }

  function changeActionType(index: number, type: FlowAction["type"]) {
    setActions((current) => current.map((action, actionIndex) => {
      if (actionIndex !== index) return action;
      const previous = action;
      if (type === previous.type) return previous;
      if (type === "send_link") return { type, text: previous.text, url: "" };
      if (type === "send_button") return { type, text: previous.text, url: "", buttonLabel: "Open link" };
      return { type, text: previous.text };
    }));
  }

  function changeTriggerType(value: ClassicTriggerType) {
    setTriggerType(value);
    if (value === "comment") {
      setActions((current) => (current.every((action) => action.type === "private_reply") ? current : [newClassicAction("private_reply")]));
      setTriggerMatch((current) => current);
    }
    if (value === "message" || value === "referral" || value === "optin" || value === "first_contact" || value === "story_mention") {
      setActions((current) => current.filter((action) => action.type !== "private_reply").length > 0
        ? current.filter((action) => action.type !== "private_reply")
        : [newClassicAction("send_text")]);
    }
    // Comment flows cannot collect emails (they may only send a single private reply).
    if (value === "comment") setEmailCaptureEnabled(false);
  }

  function buildDefinition(): FlowDefinitionV1 {
    const trigger: FlowDefinitionV1["trigger"] =
      triggerType === "comment"
        ? {
            type: "comment",
            match: triggerMatch,
            keywords: triggerMatch === "keyword" ? parseKeywords(keywords) : [],
            mediaIds: parseCommaSeparated(mediaIds),
          }
        : triggerType === "message"
          ? {
              type: "message",
              match: triggerMatch,
              keywords: triggerMatch === "keyword" ? parseKeywords(keywords) : [],
            }
          : { type: triggerType };

    const conditions: FlowCondition[] =
      !usesTextTrigger || conditionType === ""
        ? []
        : conditionType === "contains_keyword"
          ? [{ type: conditionType, keywords: parseKeywords(conditionValue) }]
          : [{ type: conditionType, mediaIds: parseCommaSeparated(conditionValue) }];

    const schedule: FlowDefinitionV1["schedule"] = {};
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (startsAt) schedule.startsAt = startsAt;
    if (endsAt) schedule.endsAt = endsAt;

    const parsedLimit = Number.parseInt(dailyLimit, 10);

    return {
      version: 1,
      trigger,
      conditions,
      actions: actions.map((action) => ({ ...action, text: action.text.trim() })),
      ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? { dailySendLimit: parsedLimit } : {}),
      ...(startsAt || endsAt ? { schedule } : {}),
      ...(emailCaptureEnabled && triggerType !== "comment" && emailPrompt.trim() && emailConfirmation.trim()
        ? {
            emailCapture: {
              promptText: emailPrompt.trim(),
              ...(emailRetry.trim() ? { retryText: emailRetry.trim() } : {}),
              confirmationText: emailConfirmation.trim(),
            },
          }
        : {}),
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if (!name.trim()) {
      setError("Give this automation a name first.");
      return;
    }
    if (usesTextTrigger && triggerMatch === "keyword" && parseKeywords(keywords).length === 0) {
      setError("Add at least one keyword.");
      return;
    }
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (scheduleStart && !startsAt) {
      setError("Enter a valid start date and time.");
      return;
    }
    if (scheduleEnd && !endsAt) {
      setError("Enter a valid end date and time.");
      return;
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      setError("The start must come before the end of the schedule.");
      return;
    }
    if (actions.some((action) => !action.text.trim())) {
      setError("Every message needs text.");
      return;
    }
    if (actions.some((action) => (action.type === "send_link" || action.type === "send_button") && !action.url.trim())) {
      setError("Link actions need a URL.");
      return;
    }
    if (emailCaptureEnabled && triggerType !== "comment" && (!emailPrompt.trim() || !emailConfirmation.trim())) {
      setError("The email collector needs both a prompt and a confirmation message.");
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
                    onChange={(event) => changeTriggerType(event.target.value as ClassicTriggerType)}
                  >
                    <option value="comment">Instagram comment</option>
                    <option value="message">Instagram DM</option>
                    <option value="first_contact">First-time contact</option>
                    <option value="story_mention">Story mention</option>
                    <option value="referral">Referral link tap</option>
                    <option value="optin">Opt-in tap</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              {usesTextTrigger && (
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
              )}
            </div>
            {usesTextTrigger && triggerMatch === "keyword" && (
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

        {usesTextTrigger && (
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
                      onChange={(event) => setConditionType(event.target.value as "" | FlowCondition["type"])}
                    >
                      <option value="">No extra condition</option>
                      <option value="contains_keyword">The text contains a keyword</option>
                      <option value="media_is">The post is one of these IDs</option>
                    </select>
                    <ChevronDown size={16} />
                  </span>
                </label>
                {conditionType !== "" && (
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
        )}

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker action-marker">{usesTextTrigger ? "03" : "02"}</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">{actions.length > 1 ? "Actions" : "Action"}</p>
                <h2>What should the person receive?</h2>
              </div>
              <Send size={21} strokeWidth={1.7} />
            </div>
            {actions.map((action, index) => (
              <div className="classic-action" key={index}>
                <div className="classic-action-head">
                  <span className="classic-action-index">Step {index + 1}</span>
                  {!usesTextTrigger && (
                    <span className="select-wrap">
                      <select
                        aria-label={`Action ${index + 1} type`}
                        value={action.type}
                        onChange={(event) => changeActionType(index, event.target.value as FlowAction["type"])}
                      >
                        {allowedActionTypes.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} />
                    </span>
                  )}
                  {actions.length > 1 && (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() => setActions((current) => current.filter((_, actionIndex) => actionIndex !== index))}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <label className="field">
                  <span>{actions.length > 1 ? `Step ${index + 1} message` : "Message text"}</span>
                  <textarea
                    aria-label={actions.length > 1 ? `Step ${index + 1} message` : "Message text"}
                    value={action.text}
                    onChange={(event) => updateAction(index, { text: event.target.value })}
                    rows={3}
                    placeholder="Write the exact message to send"
                    maxLength={1_000}
                  />
                </label>
                {(action.type === "send_link" || action.type === "send_button") && (
                  <div className="field-grid field-spaced">
                    <label className="field">
                      <span>{actions.length > 1 ? `Step ${index + 1} link URL` : "Link URL"}</span>
                      <div className="input-with-icon"><Link2 size={16} /><input aria-label={actions.length > 1 ? `Step ${index + 1} link URL` : "Link URL"} value={action.url} onChange={(event) => updateAction(index, { url: event.target.value } as Partial<FlowAction>)} placeholder="https://your-site.com/guide" /></div>
                    </label>
                    {action.type === "send_button" && (
                      <label className="field">
                        <span>{actions.length > 1 ? `Step ${index + 1} button label` : "Button label"}</span>
                        <input aria-label={actions.length > 1 ? `Step ${index + 1} button label` : "Button label"} value={action.buttonLabel} onChange={(event) => updateAction(index, { buttonLabel: event.target.value } as Partial<FlowAction>)} placeholder="Open guide" />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!usesTextTrigger && actions.length < MAX_CLASSIC_ACTIONS && (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setActions((current) => [...current, newClassicAction("send_text")])}
              >
                <Plus size={15} /> Add another message
              </button>
            )}
            {!usesTextTrigger && actions.length > 1 && (
              <p className="muted">Messages are sent in order, one after another.</p>
            )}
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        {triggerType !== "comment" && (
          <section className="flow-step">
            <div className="step-marker action-marker">{usesTextTrigger ? "04" : "03"}</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Email collector <em>optional</em></p>
                  <h2>Collect email addresses automatically</h2>
                </div>
                <Mail size={21} strokeWidth={1.7} />
              </div>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={emailCaptureEnabled}
                  onChange={(event) => setEmailCaptureEnabled(event.target.checked)}
                />
                <span>Ask for the person’s email after this flow runs</span>
              </label>
              {emailCaptureEnabled && (
                <>
                  <p className="muted field-spaced">
                    After your messages send, ReplyConnect asks for their email, checks the reply looks like a real
                    address (up to two retries), saves it to your audience list, and confirms. If someone already sent
                    an email in their first message, it’s captured instantly.
                  </p>
                  <label className="field field-spaced">
                    <span>Prompt asking for the email</span>
                    <textarea
                      aria-label="Email prompt"
                      value={emailPrompt}
                      onChange={(event) => setEmailPrompt(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="What’s the best email address to send it to?"
                    />
                  </label>
                  <label className="field">
                    <span>Retry message <em>optional</em></span>
                    <textarea
                      aria-label="Email retry message"
                      value={emailRetry}
                      onChange={(event) => setEmailRetry(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Sent when a reply isn’t a valid email address"
                    />
                  </label>
                  <label className="field">
                    <span>Confirmation message</span>
                    <textarea
                      aria-label="Email confirmation message"
                      value={emailConfirmation}
                      onChange={(event) => setEmailConfirmation(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="You’re in! ✅ Check your inbox."
                    />
                    <small>Captured emails appear on your My Automations page.</small>
                  </label>
                </>
              )}
            </div>
          </section>
        )}

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker guard-marker">{usesTextTrigger ? "05" : "04"}</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Guardrails <em>optional</em></p>
                <h2>Set limits and timing</h2>
              </div>
              <ShieldCheck size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Daily send limit</span>
              <input
                aria-label="Daily send limit"
                type="number"
                min={1}
                max={1000}
                value={dailyLimit}
                onChange={(event) => setDailyLimit(event.target.value)}
                placeholder="No limit"
              />
              <small>Pauses the automation for the rest of the day when the cap is reached.</small>
            </label>
            <div className="field-grid field-spaced">
              <label className="field">
                <span>Active from <em>optional</em></span>
                <input
                  aria-label="Schedule start"
                  type="datetime-local"
                  value={scheduleStart}
                  onChange={(event) => setScheduleStart(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Active until <em>optional</em></span>
                <input
                  aria-label="Schedule end"
                  type="datetime-local"
                  value={scheduleEnd}
                  onChange={(event) => setScheduleEnd(event.target.value)}
                />
              </label>
            </div>
            <p className="muted">Events outside the window are ignored — perfect for launches and limited offers.</p>
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
        <p className="preview-kicker">
          {triggerType === "comment" ? "A person comments" : triggerType === "message" ? "A person DMs you" : triggerType === "referral" ? "Someone taps your referral link" : "Someone taps the opt-in button"}
        </p>
        <div className="preview-message">
          <span className="preview-avatar">P</span>
          <div>
            <strong>{usesTextTrigger ? (triggerMatch === "keyword" ? `“${parseKeywords(keywords)[0] ?? "your keyword"}”` : "any message") : "Tap"}</strong>
            <small>{triggerType === "comment" ? "on your Instagram post" : triggerType === "message" ? "in Instagram DMs" : "in Instagram DMs"}</small>
          </div>
        </div>
        <div className="preview-arrow"><ArrowRight size={18} /></div>
        <p className="preview-kicker">ReplyConnect sends</p>
        {actions.map((action, index) => (
          <div className="preview-message preview-response" key={index}>
            <span className="preview-avatar preview-avatar-brand">{PRODUCT_MARK}</span>
            <div>
              <strong>{action.text || "Your exact reply appears here"}</strong>
              {"url" in action && action.url ? <small>{action.url}</small> : null}
            </div>
          </div>
        ))}
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

function looksLikeTwoLinksPastedTogether(url: string): boolean {
  return (url.match(/https?:\/\//gi)?.length ?? 0) > 1;
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
  const [followGateRequired, setFollowGateRequired] = useState(initialDefinition.followGate.required);
  const [openingVariants, setOpeningVariants] = useState((initialDefinition.openingMessage.textVariants ?? []).join("\n"));
  const [deliveryVariants, setDeliveryVariants] = useState((initialDefinition.delivery.textVariants ?? []).join("\n"));
  const [scheduleStart, setScheduleStart] = useState(isoToLocalInput(initialDefinition.schedule?.startsAt));
  const [scheduleEnd, setScheduleEnd] = useState(isoToLocalInput(initialDefinition.schedule?.endsAt));
  const [campaignDailyLimit, setCampaignDailyLimit] = useState(initialDefinition.dailySendLimit ? String(initialDefinition.dailySendLimit) : "");
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
    const schedule: FlowDefinitionV2["schedule"] = {};
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (startsAt) schedule.startsAt = startsAt;
    if (endsAt) schedule.endsAt = endsAt;
    const parsedLimit = Number.parseInt(campaignDailyLimit, 10);
    const splitVariants = (value: string) =>
      value.split("\n").map((variant) => variant.trim()).filter(Boolean);

    return {
      version: 2,
      trigger: {
        type: "comment",
        source,
        mediaIds: source === "specific_media" ? mediaIds : [],
        mediaSnapshots: source === "specific_media" ? mediaSnapshots : [],
        match,
        keywords: match === "keyword" ? parseKeywords(keywords) : [],
      },
      publicReplies: publicReplies.map((reply) => reply.trim()).filter(Boolean),
      openingMessage: {
        text: openingText.trim(),
        ...(splitVariants(openingVariants).length > 0 ? { textVariants: splitVariants(openingVariants) } : {}),
        optInButtonLabel: optInButtonLabel.trim(),
      },
      followGate: {
        required: followGateRequired,
        notFollowingMessage: followGateRequired ? notFollowingMessage.trim() : "",
        recheckButtonLabel: followGateRequired ? recheckButtonLabel.trim() : "",
      },
      delivery: {
        text: deliveryText.trim(),
        ...(splitVariants(deliveryVariants).length > 0 ? { textVariants: splitVariants(deliveryVariants) } : {}),
        url: deliveryUrl.trim(),
        ...(deliveryButtonLabel.trim() ? { buttonLabel: deliveryButtonLabel.trim() } : {}),
      },
      ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? { dailySendLimit: parsedLimit } : {}),
      ...(startsAt || endsAt ? { schedule } : {}),
    };
  }

  function validate(): string | null {
    if (!name.trim()) return "Give this automation a name first.";
    if (source === "specific_media" && mediaIds.length === 0) return "Select at least one post or Reel to watch.";
    if (match === "keyword" && parseKeywords(keywords).length === 0) return "Add at least one keyword.";
    if (publicReplies.map((reply) => reply.trim()).filter(Boolean).length > MAX_PUBLIC_REPLIES) {
      return `Use up to ${MAX_PUBLIC_REPLIES} public reply variations.`;
    }
    if (optInButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
    if (recheckButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
    if (followGateRequired && !notFollowingMessage.trim()) return "Write the not-following prompt, or turn the follow gate off.";
    if (!deliveryUrl.trim()) return "Add a delivery link.";
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (scheduleStart && !startsAt) return "Enter a valid schedule start.";
    if (scheduleEnd && !endsAt) return "Enter a valid schedule end.";
    if (startsAt && endsAt && startsAt > endsAt) return "The start must come before the end of the schedule.";
    if (openingVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 opening message variations.";
    if (deliveryVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 delivery message variations.";
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

  const keywordList = parseKeywords(keywords);
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
                  initialSnapshots={mediaSnapshots}
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
            <label className="field field-spaced">
              <span>Opening copy variations <em>optional</em></span>
              <textarea
                aria-label="Opening copy variations"
                value={openingVariants}
                onChange={(event) => setOpeningVariants(event.target.value)}
                rows={3}
                placeholder={"One variation per line — one is picked per person at random"}
              />
              <small>Variations keep the same opt-in button and rotate per participant.</small>
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
            <label className="field field-spaced gate-toggle">
              <input
                type="checkbox"
                role="switch"
                aria-label="Follow gate enabled"
                checked={followGateRequired}
                onChange={(event) => setFollowGateRequired(event.target.checked)}
              />
              <span>{followGateRequired ? "On — verify they follow you before delivering" : "Off — deliver right after the opt-in tap"}</span>
            </label>
            {followGateRequired && (
              <FollowGateFields
                notFollowingMessage={notFollowingMessage}
                onNotFollowingMessageChange={setNotFollowingMessage}
                recheckButtonLabel={recheckButtonLabel}
                onRecheckButtonLabelChange={setRecheckButtonLabel}
              />
            )}
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
                {looksLikeTwoLinksPastedTogether(deliveryUrl) && (
                  <p className="form-warning" role="status">
                    <AlertTriangle size={14} /> This looks like two links pasted together — double check it before saving.
                  </p>
                )}
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
            <label className="field field-spaced">
              <span>Delivery copy variations <em>optional</em></span>
              <textarea
                aria-label="Delivery copy variations"
                value={deliveryVariants}
                onChange={(event) => setDeliveryVariants(event.target.value)}
                rows={3}
                placeholder={"One variation per line — one is picked per person at random"}
              />
            </label>
          </div>
        </section>

        <div className="flow-connector" aria-hidden="true"><ArrowRight size={17} /></div>

        <section className="flow-step">
          <div className="step-marker guard-marker">07</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Guardrails <em>optional</em></p>
                <h2>Set limits and timing</h2>
              </div>
              <ShieldCheck size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Daily send limit</span>
              <input
                aria-label="Campaign daily send limit"
                type="number"
                min={1}
                max={1000}
                value={campaignDailyLimit}
                onChange={(event) => setCampaignDailyLimit(event.target.value)}
                placeholder="No limit"
              />
              <small>Pauses new deliveries for the rest of the day when the cap is reached.</small>
            </label>
            <div className="field-grid field-spaced">
              <label className="field">
                <span>Active from <em>optional</em></span>
                <input
                  aria-label="Campaign schedule start"
                  type="datetime-local"
                  value={scheduleStart}
                  onChange={(event) => setScheduleStart(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Active until <em>optional</em></span>
                <input
                  aria-label="Campaign schedule end"
                  type="datetime-local"
                  value={scheduleEnd}
                  onChange={(event) => setScheduleEnd(event.target.value)}
                />
              </label>
            </div>
            <p className="muted">Comments outside the window are ignored — perfect for launches and limited drops.</p>
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
              {followGateRequired ? (
                <>
                  <li>Opening DM asks for a follow before delivering anything</li>
                  <li>Recheck button reads “{recheckButtonLabel || "add a label"}”</li>
                </>
              ) : (
                <li>Follow gate is off — the link goes out right after the opt-in tap</li>
              )}
              <li>
                Verified followers land on{" "}
                {deliveryUrl ? (
                  <a href={deliveryUrl} target="_blank" rel="noreferrer" className="text-link">{deliveryUrl}</a>
                ) : (
                  "no link yet"
                )}
              </li>
              {campaignDailyLimit && <li>Daily send limit: {campaignDailyLimit}</li>}
              {(scheduleStart || scheduleEnd) && (
                <li>Active {scheduleStart ? `from ${scheduleStart}` : ""}{scheduleStart && scheduleEnd ? " " : ""}{scheduleEnd ? `until ${scheduleEnd}` : ""}</li>
              )}
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
                {deliveryUrl && (
                  <a href={deliveryUrl} target="_blank" rel="noreferrer"><small>{deliveryUrl}</small></a>
                )}
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

export function AutomationBuilder({
  automationId,
  initialName,
  initialDefinition,
  onSaved,
  variant,
}: AutomationBuilderProps & { variant?: "campaign" | "classic" }) {
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
  if (!initialDefinition && variant === "classic") {
    return (
      <AutomationBuilderV1
        automationId={automationId}
        initialName={initialName}
        onSaved={onSaved}
      />
    );
  }
  return (
    <AutomationBuilderV2
      automationId={automationId}
      initialName={initialName}
      initialDefinition={initialDefinition as FlowDefinitionV2 | undefined}
      onSaved={onSaved}
    />
  );
}
