import type { ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import { Icon, MockActionNote, MockActivity, MockCard, MockOption, MockPageAvatar, MockPanel, MockToggleRow, type MockActivityRow, type MockTone } from "../../mock-ui";
import {
  destinationNouns, exampleHandle, incomingFor, nextFor, postCaption, replyFor, stepKinds, stepPhrase, stepPlan, triggerLabel, triggerScope,
  type StepKind, type StepPlan,
} from "../../seo-example";
import { isCommentTopic } from "../../seo-theme";
import { destinationFor } from "../benefits/outcomes";
import styles from "./visuals.module.css";

/*
 * The setup UI for each step of How it works, chosen by what the step says
 * (stepKinds): a trigger panel, the requests you start with, the details you
 * ask for, a destination card, the caption, a message editor, a later
 * check-in, a planning card, the activity view, or the test and go-live card.
 * Facebook Page steps only ever show public replies. Decorative: callers render
 * them inside an aria-hidden container.
 */

export type StepVisual = { kind: StepKind; chip: string; tone: MockTone; body: ReactNode };

type StepInput = { page: SeoPage; title: string; body: string };

function Check({ children }: { children: ReactNode }) {
  return (
    <p className={styles.check}>
      <span className={styles.checkIcon}><Icon name="check" size={12} /></span>
      <span>{children}</span>
    </p>
  );
}

/* ---------- Trigger ---------- */

type PickerKind = "post" | "reel" | "story" | "page";

function pickerFor(page: SeoPage, title: string): PickerKind | null {
  if (page.topic === "facebook") return "page";
  if (page.topic === "stories") return incomingFor(page).kind === "event" ? null : "story";
  if (page.topic === "comments" || page.topic === "followers") return /\breels?\b/i.test(`${page.slug} ${title}`) ? "reel" : "post";
  return null;
}

/** Thumbnails of the posts, Reels, Stories or Page posts the automation listens to, with the chosen ones ticked. */
function Picker({ kind, caption, multiple }: { kind: PickerKind; caption: string; multiple: boolean }) {
  const count = kind === "page" ? 2 : 3;
  const chosen = (index: number) => (multiple ? index < 2 : index === (kind === "page" ? 0 : 1));
  return (
    <div className={styles.picker} data-kind={kind}>
      <div className={styles.tiles}>
        {Array.from({ length: count }, (_, index) => (
          <span key={index} className={styles.tile} data-tone={index} data-selected={chosen(index) ? "true" : undefined}>
            {kind === "page" ? (
              <>
                <span className={styles.tileHead}><i /><b /></span>
                <span className={styles.tileMedia}><Icon name="image" size={16} /></span>
              </>
            ) : kind === "reel" ? <span className={styles.play} /> : kind === "post" ? <Icon name="image" size={16} /> : null}
            {chosen(index) ? <span className={styles.tileCheck}><Icon name="check" size={10} /></span> : null}
          </span>
        ))}
      </div>
      <p className={styles.caption}>{caption}</p>
    </div>
  );
}

/* Capitalised words in a step body are the request words it suggests ("Start with PRICE, RATES…"). */
const notKeywords = new Set(["URL", "DM", "DMS", "FAQ", "API"]);
function stepKeywords(body: string): string[] {
  const words = body.match(/\b[A-Z]{3,}\b/g) ?? [];
  return [...new Set(words)].filter((word) => !notKeywords.has(word)).slice(0, 2);
}

function keywordLabel(page: SeoPage) {
  if (isCommentTopic(page.topic)) return "Comment contains";
  return page.topic === "stories" ? "Reply contains" : "Message contains";
}

function TriggerBody({ page, title, body }: StepInput) {
  const incoming = incomingFor(page);
  if (page.topic === "facebook" && /\bconnect\b/i.test(title)) {
    return (
      <MockPanel title="Facebook Page">
        <div className={styles.account}>
          <MockPageAvatar size={30} />
          <span className={styles.accountName}><strong>Your Page</strong><small>A Page you manage</small></span>
          <span className={styles.okChip}>Connected</span>
        </div>
        <Check>Public comment replies</Check>
      </MockPanel>
    );
  }
  const [selected, other] = triggerScope(page);
  const picker = pickerFor(page, title);
  const keywords = incoming.keyword ? [incoming.keyword] : stepKeywords(body);
  return (
    <MockPanel title={triggerLabel(page)}>
      {picker ? (
        <Picker kind={picker} caption={selected} multiple={/\bposts\b/i.test(selected)} />
      ) : (
        <>
          <MockOption label={selected} selected />
          <MockOption label={other} />
        </>
      )}
      {keywords.length > 0 ? (
        <p className={styles.keywordRow}>
          <span>{keywordLabel(page)}</span>
          <span className={styles.keywords}>{keywords.map((keyword) => <span key={keyword} className={styles.keyword}>{keyword}</span>)}</span>
        </p>
      ) : null}
    </MockPanel>
  );
}

/* ---------- Requests and details ---------- */

/** The recurring request the automation starts with: the example's question, or the request word people send. */
function RequestsBody({ page, title }: StepInput) {
  const incoming = incomingFor(page);
  const where = isCommentTopic(page.topic) ? "Comments" : page.topic === "stories" ? "Story replies" : "Messages";
  const request = incoming.keyword ? `${where} with ${incoming.keyword}` : incoming.kind === "quote" ? incoming.text : incoming.source;
  return (
    <MockPanel title={stepPhrase(title)}>
      <MockOption label={request} selected />
      <p className={styles.addRow}><span aria-hidden="true">+</span>Add another</p>
    </MockPanel>
  );
}

/* Details a step or its example names, as a form would label them. */
const fieldWords: readonly (readonly [RegExp, string])[] = [
  [/\bcontact address\b/i, "Contact address"],
  [/\bemail\b/i, "Email address"],
  [/\bproposal topic\b/i, "Proposal topic"],
  [/\bcampaign context\b|\bcampaign or idea\b/i, "Campaign context"],
  [/\bexperience level\b/i, "Experience level"],
  [/\btype of project\b/i, "Project type"],
  [/\btiming\b/i, "Preferred timing"],
  [/\bwhich service\b|\bservice are you\b/i, "Service"],
  [/\bcourse interest\b/i, "Course interest"],
];

function detailFields(page: SeoPage, body: string): string[] {
  const reply = replyFor(page);
  const text = `${body} ${reply.kind === "variants" ? "" : reply.text} ${page.example.next}`;
  const found = fieldWords
    .map(([pattern, label]) => ({ label, at: text.search(pattern) }))
    .filter((field) => field.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((field) => field.label);
  // A contact address and an email are the same field.
  const fields = found.includes("Contact address") ? found.filter((field) => field !== "Email address") : found;
  return (fields.length > 0 ? fields : ["Email address", "Answers"]).slice(0, 3);
}

/** The details you decide to ask for: one deciding question to choose, or the fields to collect. */
function DetailsBody({ page, title, body }: StepInput) {
  const fields = detailFields(page, body);
  const phrase = stepPhrase(title);
  // "Define the necessary details" leaves "Details", which would only repeat the chip.
  return (
    <MockPanel title={/\s/.test(phrase) ? phrase : `${phrase} to ask for`}>
      {/\bquestion\b/i.test(title)
        ? fields.map((field, index) => <MockOption key={field} label={field} selected={index === 0} />)
        : fields.map((field) => <Check key={field}>{field}</Check>)}
    </MockPanel>
  );
}

/* ---------- Destination ---------- */

/** "Prepare your guide link" becomes "Guide link"; null when the title names no destination. */
function destinationPhrase(title: string): string | null {
  const phrase = stepPhrase(title);
  if (phrase.split(/\s+/).length > 4 || /^destinations?$/i.test(phrase) || !destinationNouns.test(phrase)) return null;
  return phrase;
}

const destinationChecks: readonly (readonly [RegExp, string])[] = [
  [/\b(phone|mobile)\b/i, "Opens on a phone"],
  [/new visitor|logged-out|without (?:your|special)|\baccess/i, "Opens for a new visitor"],
  [/\b(rules|requirements|terms)\b/i, "Rules and terms checked"],
  [/\b(current|latest|update|expired|outdated|maintain|maintained|previous intake)\b/i, "Details are current"],
];

function DestinationBody({ title, body }: StepInput) {
  const checks = destinationChecks.filter(([pattern]) => pattern.test(`${title} ${body}`)).map(([, line]) => line).slice(0, 2);
  return (
    <MockPanel title={destinationPhrase(title) ?? "Your link"}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Link</span>
        <span className={styles.input}><Icon name="link" size={15} /><span>https://</span><span className={styles.placeholder}>your link</span></span>
      </div>
      {(checks.length > 0 ? checks : ["Link checked"]).map((line) => <Check key={line}>{line}</Check>)}
    </MockPanel>
  );
}

/* ---------- Instruction ---------- */

/**
 * What the caption or Story asks for, in the builder's words: the request word
 * and what it delivers. Deliberately not the example's own caption, so the
 * same caption never shows in two sections of a page.
 */
export function instructionText(page: SeoPage): string {
  const keyword = incomingFor(page).keyword;
  if (!keyword) return postCaption(page);
  const thing = destinationFor(page).title.toLowerCase();
  if (page.topic === "stories") return `Reply ${keyword} and we’ll send you the ${thing}.`;
  if (page.topic === "messages" || page.topic === "leads") return `Send ${keyword} in a DM for the ${thing}.`;
  if (page.topic === "facebook") return `Comment ${keyword} for the ${thing}.`;
  return `Comment ${keyword} and we’ll DM you the ${thing}.`;
}

function Editor({ children, caret = true }: { children: ReactNode; caret?: boolean }) {
  return <p className={styles.editor}>{children}{caret ? <span className={styles.caret} /> : null}</p>;
}

/** The instruction with the request word picked out. */
function InstructionText({ page }: { page: SeoPage }) {
  const text = instructionText(page);
  const keyword = incomingFor(page).keyword;
  const at = keyword ? text.indexOf(keyword) : -1;
  if (!keyword || at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{keyword}</mark>{text.slice(at + keyword.length)}</>;
}

function InstructionBody({ page }: StepInput) {
  const where = page.topic === "stories" ? "Story text" : page.topic === "messages" || page.topic === "leads" ? "Invitation" : "Caption";
  return (
    <MockPanel title={where}>
      <Editor><InstructionText page={page} /></Editor>
      <p className={styles.meta}><Icon name="bolt" size={14} />Same word as the trigger</p>
    </MockPanel>
  );
}

/* ---------- Message ---------- */

function collects(title: string): boolean {
  return /\b(email|collection|collect|intake|fields?|enquiry|information request|information flow|prompts)\b/i.test(title);
}

function messageChip(page: SeoPage, title: string): string {
  if (collects(title)) return "Question";
  return page.topic === "facebook" ? "Public reply" : "Message";
}

function editorTitle(page: SeoPage): string {
  if (page.topic === "facebook") return "Reply under the post";
  if (isCommentTopic(page.topic)) return "Private reply";
  if (page.topic === "stories") return incomingFor(page).kind === "event" ? "Reply to the mention" : "Story reply";
  return "Reply";
}

/** The reply's button as the builder shows it: a labelled field, not the DM button itself. */
function ButtonField({ label }: { label: string }) {
  return (
    <p className={styles.buttonField}>
      <span className={styles.fieldLabel}>Button</span>
      <span className={styles.buttonValue}><Icon name="link" size={13} />{label}</span>
    </p>
  );
}

function MessageBody({ page, title, body }: StepInput) {
  const text = `${title} ${body}`;
  const reply = replyFor(page);
  const next = nextFor(page);
  const fields = collects(title)
    ? [/\bemail\b/i.test(text) ? "Email" : null, /\b(fields?|answers?|questions|details|intake|context|prompts)\b/i.test(text) ? "Answers" : null].filter((field): field is string => field !== null)
    : [];

  let content: ReactNode;
  if (reply.kind === "variants") {
    content = (
      <>
        <p className={styles.tabs}>{reply.variants.map((variant, index) => <span key={variant.label} className={styles.tab} data-active={index === 0 ? "true" : undefined}>Version {variant.label}</span>)}</p>
        <Editor>{reply.variants[0].text}</Editor>
      </>
    );
  } else if (reply.kind === "action") {
    content = <MockActionNote>{reply.text}</MockActionNote>;
  } else {
    content = <Editor>{reply.text}</Editor>;
  }

  let extra: ReactNode = null;
  if (fields.length > 0) {
    extra = <p className={styles.saveRow}><span>Saves</span>{fields.map((field) => <span key={field} className={styles.saveChip}>{field}</span>)}</p>;
  } else if (page.topic === "facebook") {
    extra = <p className={styles.meta}><Icon name="comment" size={14} />Posted publicly under the comment</p>;
  } else if (page.topic === "followers") {
    extra = <MockToggleRow className={styles.toggle} label="Follow check" />;
  } else if (page.topic === "team") {
    extra = <MockToggleRow className={styles.toggle} label="Hand to your team" />;
  } else if (/\btrack(ed)?\b/i.test(text)) {
    extra = <MockToggleRow className={styles.toggle} label="Track link visits" />;
  } else if (next.kind === "button") {
    extra = <ButtonField label={next.label} />;
  } else {
    extra = <p className={styles.addRow}><span aria-hidden="true">+</span>Add a button</p>;
  }

  return (
    <MockPanel title={editorTitle(page)}>
      {content}
      {extra}
    </MockPanel>
  );
}

/* ---------- Follow-up ---------- */

function FollowupBody({ page }: StepInput) {
  const next = nextFor(page);
  if (next.kind !== "later") {
    return (
      <MockPanel title="Check-in">
        <p className={styles.meta}><Icon name="clock" size={14} />Sent after a delay you choose</p>
        <p className={styles.addRow}><span aria-hidden="true">+</span>Write the check-in</p>
      </MockPanel>
    );
  }
  const when = /^later$/i.test(next.label) ? "Sent later, if still relevant" : `${next.label}, sent later if still relevant`;
  return (
    <MockPanel title="Check-in">
      <p className={styles.meta}><Icon name="clock" size={14} />{when}</p>
      <Editor>{next.message}</Editor>
    </MockPanel>
  );
}

/* ---------- Plan ---------- */

function PlanBody({ page, plan }: { page: SeoPage; plan: StepPlan }) {
  const reply = replyFor(page);
  const versions = reply.kind === "variants" ? reply.variants.map((variant) => variant.label) : ["A", "B"];
  return (
    <MockPanel title={plan.title}>
      {plan.options?.map((option, index) => <MockOption key={option} label={option} selected={index === 0} />)}
      {plan.versions ? <p className={styles.versions}>{versions.map((label) => <span key={label}>Version {label}</span>)}</p> : null}
      {plan.toggle ? <MockToggleRow className={styles.toggle} label={plan.toggle} /> : null}
      {plan.checks?.map((line) => <Check key={line}>{line}</Check>)}
    </MockPanel>
  );
}

/* ---------- Activity ---------- */

/** What the automation did, without numbers: who, what happened, and a status. */
function ActivityBody({ page, title }: StepInput) {
  const reply = replyFor(page);
  const handle = (index: number) => exampleHandle(page, index);
  let heading = "Delivery activity";
  let rows: MockActivityRow[] = [
    { name: handle(0), label: "Received the reply", status: "Delivered", tone: "mint" },
    { name: handle(1), label: "Opened the tracked link", status: "Visit", tone: "sky" },
    { name: handle(2), label: "Reply not delivered", status: "Investigate", tone: "pink" },
  ];
  if (reply.kind === "variants" && /\b(choosing|results|variant)\b/i.test(title)) {
    heading = "Version activity";
    rows = reply.variants.map((variant, index) => ({ name: handle(index), label: `Received Version ${variant.label}`, status: "Delivered", tone: index === 0 ? "mint" : "sky" }));
  } else if (/\bclicks\b/i.test(title)) {
    heading = "Link activity";
    rows = [
      { name: handle(0), label: "Opened your tracked link", status: "Visit", tone: "sky" },
      { name: handle(1), label: "Received the reply", status: "Delivered", tone: "mint" },
      { name: handle(2), label: "Your own test click", status: "Test", tone: "yellow" },
    ];
  }
  return <MockActivity className={styles.activity} title={heading} rows={rows} />;
}

/* ---------- Test and go live ---------- */

type CheckPair = readonly [string, string];
type CheckRule = readonly [RegExp, (page: SeoPage, text: string) => CheckPair];
const pair = (first: string, second: string) => (): CheckPair => [first, second];

const defaultChecks: Record<SeoPage["topic"], CheckPair> = {
  comments: ["Test comment from another account", "Link opens on a phone"],
  followers: ["Follow check tested", "Resource arrives after the check"],
  messages: ["Test message from another account", "Reply arrives as written"],
  stories: ["Story reply from another account", "Link opens on a phone"],
  leads: ["Test enquiry saved", "Team can continue from it"],
  team: ["Opened in the team inbox", "Automatic replies paused"],
  insights: ["Activity visible for this automation", "Compared like for like"],
  facebook: ["Test comment under the post", "Answer visible in the thread"],
};

/* First match wins: each rule reads the step's own title and body. */
const liveRules: readonly CheckRule[] = [
  [/follower and a non-follower|both follower|both paths/i, pair("Follower path checked", "Non-follower path checked")],
  [/invalid address|malformed/i, pair("Invalid address retried", "Valid address saved")],
  [/early exit|partial enquiry/i, pair("Full route completed", "Early exit checked")],
  [/returning/i, pair("New contact welcomed", "No repeat welcome")],
  [/non-selected post|on another post/i, pair("Selected post answered", "Other posts left alone")],
  [/\bskip/i, pair("Follow-up sent on time", "Skip cases checked")],
  [/\bvariant|both journeys|every version/i, pair("Version A previewed", "Version B previewed")],
  [/checkout/i, pair("Link opens on a phone", "Checkout tested separately")],
  [/\bmentions?\b/i, pair("Mention from another account", "Acknowledgement arrived")],
  [/team inbox|in the inbox|inbox transition/i, pair("Opened in the team inbox", "Automatic replies paused")],
  [/second message|owns the response/i, pair("Story reply from another account", "No duplicate DM answer")],
  [/unrelated|ambiguous|differently|different question|non-matching|normal comment/i, (page) => (isCommentTopic(page.topic)
    ? ["Matching comment answered", "Other comments left alone"]
    : ["Expected request matched", "Unrelated request ignored"])],
  [/repeat(?:ed)? (?:message|request|comment)/i, pair("Expected request answered", "Repeat request checked")],
  [/time periods|clicks with context/i, pair("Similar periods compared", "Test visits set aside")],
  [/investigate failures|delivery activity/i, pair("Delivery activity reviewed", "Failures investigated")],
  [/less common answer|expected route/i, pair("Expected route walked through", "Less common answer tried")],
  [/contact record|saved contact/i, pair("Sample contact saved", "Attached to the right conversation")],
  [/enrollment|enrolment|registration|ticketing/i, pair("Sign-up route followed", "Confirmation checked at the source")],
  [/saved answers|saved enquir|saved request|saved details|review the answers|route to your team|personally/i, (_page, text) => [/booking/i.test(text) ? "Booking link opens" : "Saved answers reviewed", "Team continues personally"]],
  [/booking|scheduling|appointment/i, pair("Booking link opens", "Confirmation checked at the source")],
  [/retire|retirement|closing date/i, pair("Matching reply tested", "End date planned")],
  [/periodically|older recommendations/i, pair("Active links rechecked", "Discontinued items replaced")],
  [/old post|older post/i, pair("Current post tested", "Older post tested")],
  [/special request|normal enquiry/i, pair("Normal enquiry answered", "Special request routed")],
  [/closure|actual location/i, pair("Realistic question answered", "Location and closures shown")],
  [/policy link|support route/i, pair("Policy link opens", "Support route included")],
  [/each link|every choice/i, pair("Every link opened", "Readable on a small screen")],
  [/responsibility|owns the follow-up/i, (page) => [defaultChecks[page.topic][0], "Owner set for follow-up"]],
  [/instagram browser/i, (_page, text) => ["Link opens inside Instagram", /tracked/i.test(text) ? "Tracked activity checked" : "Reply promises only what you offer"]],
  [/tracked activity|tracked visits|link activity/i, pair("Resource request tested", "Link activity reviewed")],
  [/as a visitor|new visitor/i, pair("Opens for a new visitor", "Links checked")],
];

/** The two checks a step's test covers, read from its own words, else the topic's usual test. */
export function liveChecks(page: SeoPage, title: string, body: string): CheckPair {
  const text = `${title} ${body}`;
  const rule = liveRules.find(([pattern]) => pattern.test(text));
  return rule ? rule[1](page, text) : defaultChecks[page.topic];
}

/** The switch reads "Test run" before a later step and "Automation live" on the last one. */
function LiveBody({ page, title, body, toggle }: StepInput & { toggle: string }) {
  const [first, second] = liveChecks(page, title, body);
  return (
    <MockCard className={styles.live}>
      <MockToggleRow className={styles.toggle} label={toggle} />
      <Check>{first}</Check>
      <Check>{second}</Check>
    </MockCard>
  );
}

/* ---------- Assembly ---------- */

/* Each kind's usual tone; a page never shows the same tone twice in a row of three. */
const kindTones: Record<StepKind, MockTone> = {
  trigger: "yellow", requests: "pink", details: "pink", destination: "sky", instruction: "lilac", message: "lilac",
  followup: "pink", plan: "sky", activity: "sky", test: "mint", live: "mint",
};
const toneCycle: readonly MockTone[] = ["yellow", "lilac", "pink", "mint", "sky"];

function distinctTones(kinds: readonly StepKind[]): MockTone[] {
  const used: MockTone[] = [];
  return kinds.map((kind) => {
    const preferred = kindTones[kind];
    const start = toneCycle.indexOf(preferred);
    const tone = used.includes(preferred) && used.length < toneCycle.length
      ? toneCycle.map((_, offset) => toneCycle[(start + offset) % toneCycle.length]).find((candidate) => !used.includes(candidate)) ?? preferred
      : preferred;
    used.push(tone);
    return tone;
  });
}

/** One visual per step, in step order: the chip names what the step's title says, and the panel shows it. */
export function stepVisuals(page: SeoPage): readonly StepVisual[] {
  const assigned = stepKinds(page);
  const kinds = page.steps.map((_, index): StepKind => assigned[index] ?? "plan");
  const tones = distinctTones(kinds);
  return page.steps.map(([title, body], index) => {
    const input: StepInput = { page, title, body };
    const kind = kinds[index];
    const tone = tones[index];
    switch (kind) {
      case "trigger": return { kind, chip: "Trigger", tone, body: <TriggerBody {...input} /> };
      case "requests": return { kind, chip: "Requests", tone, body: <RequestsBody {...input} /> };
      case "details": return { kind, chip: "Details", tone, body: <DetailsBody {...input} /> };
      case "destination": return { kind, chip: "Destination", tone, body: <DestinationBody {...input} /> };
      case "instruction": return { kind, chip: "Instruction", tone, body: <InstructionBody {...input} /> };
      case "message": return { kind, chip: messageChip(page, title), tone, body: <MessageBody {...input} /> };
      case "followup": return { kind, chip: "Follow-up", tone, body: <FollowupBody {...input} /> };
      case "activity": return { kind, chip: "Activity", tone, body: <ActivityBody {...input} /> };
      case "test": return { kind, chip: "Test", tone, body: <LiveBody {...input} toggle="Test run" /> };
      case "live": return { kind, chip: "Go live", tone, body: <LiveBody {...input} toggle="Automation live" /> };
      default: {
        const plan = stepPlan(title);
        return { kind, chip: plan.chip, tone, body: <PlanBody page={page} plan={plan} /> };
      }
    }
  });
}
