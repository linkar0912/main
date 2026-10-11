"use client";

import { Check, Eye, Plus, X } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Presentational pieces shared by both automation builders (classic and
 * campaign). They own layout and accessibility only - every value, rule and
 * save stays in automation-builder.tsx.
 */

export type WizardStepInfo = { label: string };

/** Numbered progress for the wizard. Done steps stay clickable for review;
 * steps past the furthest unlocked one are disabled until the current step
 * passes its checks. */
export function BuilderStepper({ steps, active, unlocked, onSelect }: {
  steps: WizardStepInfo[];
  active: number;
  unlocked: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="builder-stepper" aria-label="Builder steps">
      <ol>
        {steps.map((step, index) => {
          const state = index === active ? "is-active" : index > unlocked ? "is-locked" : index < active ? "is-done" : "is-open";
          return (
            <li key={step.label} className={`builder-stepper-item ${state}`}>
              <button
                type="button"
                aria-current={index === active ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${step.label}`}
                disabled={index > unlocked}
                onClick={() => onSelect(index)}
              >
                <span className="builder-stepper-dot" aria-hidden>
                  {state === "is-done" ? <Check size={13} strokeWidth={2.6} /> : index + 1}
                </span>
                <span className="builder-stepper-label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="builder-stepper-current" aria-hidden>
        Step {active + 1} of {steps.length}: <strong>{steps[active]?.label}</strong>
      </p>
    </nav>
  );
}

/** One wizard step: a single card that asks one question. Hidden steps stay
 * mounted so their values (and the browser's form state) survive Back/Next. */
export function WizardStep({ hidden, title, description, optional, children, className = "" }: {
  hidden: boolean;
  title: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <div className={`wizard-step${hidden ? " is-hidden" : ""}`}>
      <section className={`builder-card ${className}`.trim()} aria-labelledby={headingId}>
        <header className="builder-card-head">
          <h2 id={headingId}>{title}</h2>
          {optional ? <span className="builder-optional-tag">Optional</span> : null}
          {description ? <p>{description}</p> : null}
        </header>
        {children}
      </section>
    </div>
  );
}

/** A sub-question inside a step, separated by a hairline rather than another card. */
export function StepGroup({ title, description, children, className = "" }: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`builder-group ${className}`.trim()}>
      {title ? <h3>{title}</h3> : null}
      {description ? <p className="builder-group-lede">{description}</p> : null}
      {children}
    </div>
  );
}

/** Inline validation message for a control that is not wrapped in a Field. */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="builder-field-error" role="alert">{message}</p>;
}

/**
 * A labelled control: visible label (its accessible name), optional marker,
 * hint and inline error, wired up with aria-describedby / aria-invalid. The
 * label wraps the control (it is display: contents, so the field still lays
 * out as label row, control, hint); the "Optional" marker sits outside it so
 * it never becomes part of the control's name. The single child must be the
 * input, select or textarea.
 */
export function Field({ label, hint, error, optional, className = "", children }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const generatedId = useId();
  const childProps = isValidElement(children) ? children.props : {};
  const controlId = typeof childProps.id === "string" ? childProps.id : generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`builder-field ${className}`.trim()}>
      <label className="builder-field-label">
        <span className="builder-field-text">{label}</span>
        {cloneElement(children, {
          id: controlId,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })}
      </label>
      {optional ? <span className="builder-optional">Optional</span> : null}
      {hint ? <div className="builder-field-hint" id={hintId}>{hint}</div> : null}
      {error ? <p className="builder-field-error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}

/** Optional extras folded away so the main question stays in front. Opens by
 * itself when it already holds a value, so nothing set is ever hidden. */
export function Disclosure({ summary, initiallyOpen = false, children }: {
  summary: string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details className="builder-disclosure" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{summary}</summary>
      <div className="builder-disclosure-body">{children}</div>
    </details>
  );
}

/** An on/off row: a switch-styled checkbox whose label says what "on" means. */
export function ToggleRow({ label, hint, checked, onChange, role }: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  role?: "switch";
}) {
  const id = useId();
  return (
    <div className="builder-toggle">
      <input id={id} type="checkbox" role={role} checked={checked} onChange={(event) => onChange(event.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id}>{label}</label>
      {hint ? <p className="builder-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

/** Big tappable radio choices, for decisions a creator should see side by side. */
export function ChoiceCards<Value extends string>({ legend, name, value, options, onChange, className = "" }: {
  legend: string;
  name: string;
  value: Value;
  options: { value: Value; label: string; description?: string; icon?: ReactNode }[];
  onChange: (value: Value) => void;
  className?: string;
}) {
  return (
    <fieldset className={`builder-choices ${className}`.trim()}>
      <legend>{legend}</legend>
      <div className="builder-choice-grid">
        {options.map((option) => (
          <label key={option.value} className={`builder-choice${option.value === value ? " is-selected" : ""}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.icon ? <span className="builder-choice-icon" aria-hidden>{option.icon}</span> : null}
            <span className="builder-choice-copy">
              <strong>{option.label}</strong>
              {option.description ? <small>{option.description}</small> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function splitKeywords(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function dedupeKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Keyword chips over the same comma-separated value the builders always
 * stored: committed words render as removable chips and the word being typed
 * stays the last item, so a half-typed keyword still counts when saving.
 */
export function KeywordInput({ label, value, onChange, placeholder, hint, error, suggestions = [] }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: string | null;
  suggestions?: string[];
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const all = splitKeywords(value);
  const draftKey = draft.trim();
  const committed = draftKey && all[all.length - 1] === draftKey ? all.slice(0, -1) : all;
  const committedKeys = new Set(committed.map((keyword) => keyword.toLowerCase()));

  function emit(words: string[], nextDraft: string) {
    setDraft(nextDraft);
    onChange(dedupeKeywords([...words, ...(nextDraft.trim() ? [nextDraft.trim()] : [])]).join(", "));
  }

  function handleInput(next: string) {
    if (!next.includes(",")) {
      emit(committed, next);
      return;
    }
    const parts = next.split(",");
    const tail = parts.pop() ?? "";
    emit([...committed, ...parts.map((part) => part.trim()).filter(Boolean)], tail.trimStart());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Enter inside the classic builder's <form> would otherwise submit it.
      event.preventDefault();
      if (draftKey) emit([...committed, draftKey], "");
    } else if (event.key === "Backspace" && !draft && committed.length > 0) {
      emit(committed.slice(0, -1), "");
    }
  }

  const remaining = suggestions.filter((suggestion) => !committedKeys.has(suggestion.toLowerCase()) && suggestion.toLowerCase() !== draftKey.toLowerCase());

  return (
    <div className="builder-field">
      <label className="builder-field-text" htmlFor={id}>{label}</label>
      <div className={`keyword-input${error ? " is-invalid" : ""}`}>
        {committed.map((keyword) => (
          <span className="keyword-chip" key={keyword.toLowerCase()}>
            {keyword}
            <button type="button" aria-label={`Remove ${keyword}`} onClick={() => emit(committed.filter((item) => item !== keyword), draft)}>
              <X size={13} strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => handleInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (draftKey) emit([...committed, draftKey], ""); }}
          placeholder={committed.length === 0 ? placeholder : "Add another"}
          aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {hint ? <p className="builder-field-hint" id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p className="builder-field-error" id={`${id}-error`} role="alert">{error}</p> : null}
      {remaining.length > 0 && (
        <div className="keyword-suggestions" data-testid="keyword-suggestions">
          <span className="keyword-suggestions-label">Popular</span>
          {remaining.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="keyword-suggestion-chip"
              onClick={() => emit([...committed, ...(draftKey ? [draftKey] : []), suggestion], "")}
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PERSONALIZE_OPTIONS = [
  { token: "{username}", label: "Their username" },
  { token: "{keyword}", label: "The word they used" },
  { token: "{media}", label: "The post" },
] as const;

/** Insert buttons for the personalisation placeholders, named for what they fill in. */
export function PersonalizeButtons({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="personalize-row">
      <span>Personalize with</span>
      {PERSONALIZE_OPTIONS.map((option) => (
        <button key={option.token} type="button" className="personalize-chip" title={`Inserts ${option.token}`} onClick={() => onInsert(option.token)}>
          <Plus size={12} strokeWidth={2.4} aria-hidden /> {option.label}
        </button>
      ))}
    </div>
  );
}

/** Appends a placeholder to a message with one separating space. */
export function appendToken(text: string, token: string): string {
  if (!text) return token;
  return /\s$/.test(text) ? `${text}${token}` : `${text} ${token}`;
}

/**
 * The always-visible action bar: notices, save state, Back/Next and the two
 * save buttons on the last step. Sticky at the bottom of the viewport on
 * every breakpoint so the next move is never a scroll away.
 */
export function BuilderFooter({
  notice,
  status,
  isFirst,
  isLast,
  pendingIntent,
  activateType,
  onBack,
  onNext,
  onSaveDraft,
  onActivate,
  onPreview,
  previewOpen,
}: {
  notice?: ReactNode;
  status?: ReactNode;
  isFirst: boolean;
  isLast: boolean;
  pendingIntent: "draft" | "activate" | null;
  /** The classic builder is a <form> that activates on submit. */
  activateType: "submit" | "button";
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onActivate?: () => void;
  onPreview: () => void;
  previewOpen: boolean;
}) {
  return (
    <div className={`builder-footer${isLast ? " is-last" : ""}`}>
      {notice ? <div className="builder-footer-notice">{notice}</div> : null}
      <div className="builder-footer-bar">
        <button type="button" className="button button-secondary builder-mobile-preview-trigger" aria-expanded={previewOpen} onClick={onPreview}>
          <Eye size={16} /> Preview
        </button>
        <p className="builder-save-state">{status}</p>
        <div className="builder-actions">
          {!isFirst && (
            <button type="button" className="button button-secondary" onClick={onBack}>
              Back
            </button>
          )}
          {!isLast ? (
            <button type="button" className="button button-primary" onClick={onNext}>
              Next
            </button>
          ) : (
            <>
              <button type="button" className="button button-secondary" disabled={pendingIntent !== null} onClick={onSaveDraft}>
                {pendingIntent === "draft" ? "Saving…" : "Save draft"}
              </button>
              <button
                type={activateType}
                className="button button-primary"
                disabled={pendingIntent !== null}
                onClick={activateType === "button" ? onActivate : undefined}
              >
                {pendingIntent === "activate" ? "Turning on…" : "Save and turn on"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Save state shown in the footer: quiet text with an icon, never green. */
export function SaveState({ dirty, saved }: { dirty: boolean; saved: boolean }) {
  if (dirty) return <span className="builder-save-dirty"><span aria-hidden className="builder-save-dot" /> Unsaved changes</span>;
  if (saved) return <span><Check size={14} aria-hidden /> All changes saved</span>;
  return null;
}

/** The phone preview: a sticky side panel on desktop, a full-screen sheet on phones. */
export function PreviewPanel({ open, onClose, panelRef, closeRef, hint, children }: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {open ? <button type="button" className="builder-preview-scrim" aria-label="Close phone mockup backdrop" onClick={onClose} /> : null}
      <aside
        ref={panelRef}
        tabIndex={-1}
        className={`builder-preview${open ? " is-open" : ""}`}
        aria-label="Message preview"
        {...(open ? { role: "dialog", "aria-modal": true } : {})}
      >
        <div className="builder-preview-heading">
          <div>
            <h2>Preview</h2>
            {hint ? <p>{hint}</p> : null}
          </div>
          <button ref={closeRef} type="button" className="icon-button builder-preview-close" aria-label="Close phone mockup" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </aside>
    </>
  );
}
