import { CalendarClock, Film, Link2, Mail, MessageCircle, Send, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import {
  ReviewBeat,
  ReviewQuote,
  ReviewStory,
  channelPhrase,
  describeDelay,
  quotedList,
} from "./automation-builder/review-section";
import type { AutomationRecord } from "@/src/lib/repository";
import type { FlowAction, FlowDefinitionV1, FlowDefinitionV2 } from "@/src/lib/automation/types";
import { formatDateTime } from "@/src/lib/format-date";

/**
 * "What it does", read back from a saved automation the way the builder's
 * Review step tells it while editing: one sentence per beat, with the exact
 * messages quoted. It reuses the Review step's pieces (ReviewStory, the
 * keyword list and delay phrasing) so the two never drift apart in tone.
 */

type V1Trigger = FlowDefinitionV1["trigger"];

function triggerSentence(trigger: V1Trigger, facebook: boolean): string {
  switch (trigger.type) {
    case "comment": return facebook ? "Someone comments on a Page post" : "Someone comments on your post";
    case "message": return "Someone sends you a DM";
    case "first_contact": return "Someone messages you for the first time";
    case "story_reply": return "Someone replies to your Story";
    case "story_mention": return "Someone mentions you in their Story";
    case "referral": return "Someone opens your referral link";
    case "optin": return "Someone taps your permission button";
  }
}

/** The opening beat: what starts it, which words count, which posts. */
export function describeTrigger(definition: FlowDefinitionV1, facebook: boolean): string {
  const trigger = definition.trigger;
  const keywords = "match" in trigger && trigger.match === "keyword" ? trigger.keywords.filter((word) => word.trim()) : [];
  let sentence = trigger.type === "comment" ? "Someone comments" : triggerSentence(trigger, facebook);
  if ("match" in trigger && trigger.match === "keyword") {
    sentence += keywords.length ? `${trigger.type === "comment" ? "" : " with"} ${quotedList(keywords)}` : " with a keyword";
  }
  if (trigger.type === "comment") {
    const posts = trigger.mediaIds.length;
    sentence += posts > 0
      ? ` on ${posts} chosen post${posts === 1 ? "" : "s"}`
      : facebook ? " on any of your Page’s posts" : " on any of your posts";
  }
  sentence += ".";
  const noun = trigger.type === "comment" ? "comment" : trigger.type === "story_reply" ? "Story reply" : "message";
  for (const condition of definition.conditions ?? []) {
    if (condition.type === "contains_keyword" && condition.keywords.length) {
      sentence += ` It only replies if the ${noun} also contains ${quotedList(condition.keywords)}.`;
    } else if (condition.type === "media_is" && condition.mediaIds.length) {
      const count = condition.mediaIds.length;
      sentence += ` It only replies on ${count} chosen post${count === 1 ? "" : "s"}.`;
    }
  }
  return sentence;
}

/** Plain names for what each action sends, for lists and tests. */
export function actionLabel(action: FlowAction, facebook = false): string {
  switch (action.type) {
    case "private_reply": return facebook ? "Public comment reply" : "Private reply";
    case "send_text": return "Send a DM";
    case "send_link": return "Send a link";
    case "send_image": return "Send an image";
    case "quick_replies": return "Send quick replies";
    case "send_button": return "Send a button";
  }
}

function quote(action: FlowAction, index: number): ReactNode {
  if (action.type === "send_image") {
    return <ReviewQuote key={index} text={`Photo${action.caption?.trim() ? `, then “${action.caption.trim()}”` : ""}`} />;
  }
  const button = action.type === "send_button" ? action.buttonLabel.trim() || undefined : undefined;
  const tail = action.type === "send_link" && action.url.trim() ? ` ${action.url.trim()}` : "";
  const answers = action.type === "quick_replies" ? action.replies.filter((reply) => reply.trim()) : [];
  return (
    <span className="review-quote-group" key={index}>
      <ReviewQuote text={`${action.text.trim() || "(no text yet)"}${tail}`} button={button} />
      {answers.length > 0 ? <span className="review-answers">{answers.map((answer) => <span key={answer}>{answer}</span>)}</span> : null}
    </span>
  );
}

function scheduleSentence(schedule: { startsAt?: string; endsAt?: string } | undefined): string | null {
  if (!schedule?.startsAt && !schedule?.endsAt) return null;
  return `It runs${schedule.startsAt ? ` from ${formatDateTime(schedule.startsAt)}` : ""}${schedule.endsAt ? ` until ${formatDateTime(schedule.endsAt)}` : ""}.`;
}

/** The "how often and when" beat, as the Review step words it. */
export function limitsSentences({ dailyLimit, schedule, priority, oncePerPerson, noun }: {
  dailyLimit?: number;
  schedule?: { startsAt?: string; endsAt?: string };
  priority: number;
  oncePerPerson?: boolean;
  noun: string;
}): string[] {
  const sentences: string[] = [];
  if (oncePerPerson) sentences.push("Each person gets one reply, even if they comment again.");
  if (dailyLimit) sentences.push(`It stops for the day after ${dailyLimit.toLocaleString("en-IN")} ${noun}.`);
  const when = scheduleSentence(schedule);
  if (when) sentences.push(when);
  if (Number.isFinite(priority) && priority !== 0) {
    sentences.push(`If another automation also matches, the higher priority wins (this one is ${priority}).`);
  }
  if (sentences.length === 0) sentences.push("No daily limit or end date. It keeps running until you turn it off.");
  return sentences;
}

function ClassicStory({ automation, definition, facebook, place }: {
  automation: AutomationRecord;
  definition: FlowDefinitionV1;
  facebook: boolean;
  place: string;
}) {
  const trigger = definition.trigger;
  const actions = definition.actions;
  const lead = trigger.type === "comment"
    ? facebook ? "Your Page replies under their comment:" : "Linkar sends them a private DM:"
    : actions.length === 1 ? "Linkar replies with:" : `Linkar replies with ${actions.length} messages, in order:`;
  const followUps = (definition.followUps ?? []).filter((followUp) => followUp.text.trim());
  const reminders = followUps.length > 0
    ? `Then ${followUps.length} reminder message${followUps.length === 1 ? " follows" : "s follow"}, ${followUps
      .map((followUp) => describeDelay(Math.max(1, Math.min(10_080, followUp.delayMinutes || 60))))
      .join(" and ")} later.`
    : null;
  const capture = trigger.type !== "comment" ? definition.emailCapture : undefined;
  return (
    <ReviewStory title={<>“{automation.name}” on {place}</>}>
      <ReviewBeat icon={<MessageCircle size={17} />}>
        <p>{describeTrigger(definition, facebook)}</p>
      </ReviewBeat>
      <ReviewBeat icon={<Send size={17} />}>
        <p>{actions.length ? lead : "It doesn’t send anything yet. Add a message in Edit."}</p>
        {actions.length ? <div className="review-quotes">{actions.map(quote)}</div> : null}
      </ReviewBeat>
      {capture ? (
        <ReviewBeat icon={<Mail size={17} />}>
          <p>
            Then it asks for their email and saves it to Contacts.
            {capture.delivery?.subject.trim() ? ` It emails them “${capture.delivery.subject.trim()}” straight away.` : ""}
          </p>
        </ReviewBeat>
      ) : null}
      {reminders ? (
        <ReviewBeat icon={<Send size={17} />}>
          <p>{reminders}</p>
        </ReviewBeat>
      ) : null}
      <ReviewBeat icon={<CalendarClock size={17} />}>
        {limitsSentences({
          dailyLimit: definition.dailySendLimit,
          schedule: definition.schedule,
          priority: automation.priority,
          oncePerPerson: trigger.type === "comment" && trigger.replyOncePerUser,
          noun: "replies",
        }).map((sentence) => <p key={sentence}>{sentence}</p>)}
      </ReviewBeat>
    </ReviewStory>
  );
}

function CampaignStory({ automation, definition, place }: { automation: AutomationRecord; definition: FlowDefinitionV2; place: string }) {
  const trigger = definition.trigger;
  const keywords = trigger.match === "keyword" ? trigger.keywords.filter((word) => word.trim()) : [];
  const replies = definition.publicReplies.filter((reply) => reply.trim());
  const source = trigger.source === "specific_media"
    ? trigger.mediaIds.length > 0
      ? `${trigger.mediaIds.length} selected post${trigger.mediaIds.length === 1 ? "" : "s"}`
      : "no post selected yet"
    : trigger.source === "all_media" ? "all of your posts" : "the next post you publish";
  const gate = definition.followGate;
  const delivery = definition.delivery;
  return (
    <ReviewStory title={<>“{automation.name}” on {place}</>}>
      <ReviewBeat icon={<Film size={17} />}>
        <p>Linkar watches {source}.</p>
      </ReviewBeat>
      <ReviewBeat icon={<MessageCircle size={17} />}>
        <p>
          When {trigger.match === "keyword" ? (keywords.length ? `someone comments ${quotedList(keywords)}` : "someone comments a chosen word") : "anyone comments"},
          {replies.length
            ? ` it replies under their comment${replies.length > 1 ? `, taking turns between ${replies.length} versions like` : ""}:`
            : " it doesn’t reply in the comments."}
        </p>
        {replies[0] ? <div className="review-quotes"><ReviewQuote text={replies[0]} /></div> : null}
      </ReviewBeat>
      <ReviewBeat icon={<Send size={17} />}>
        <p>Then it sends them a DM with a button to tap:</p>
        <div className="review-quotes"><ReviewQuote text={definition.openingMessage.text.trim() || "(no first message yet)"} button={definition.openingMessage.optInButtonLabel.trim() || undefined} /></div>
      </ReviewBeat>
      <ReviewBeat icon={<UserCheck size={17} />}>
        {gate.required ? (
          <>
            <p>If they don’t follow you yet, it asks them to follow first:</p>
            <div className="review-quotes"><ReviewQuote text={gate.notFollowingMessage.trim() || "(no message yet)"} button={gate.recheckButtonLabel.trim() || undefined} /></div>
          </>
        ) : (
          <p>It doesn’t check whether they follow you, so the link goes out after they tap.</p>
        )}
      </ReviewBeat>
      <ReviewBeat icon={<Link2 size={17} />}>
        <p>{gate.required ? "Once they follow you, it sends your link:" : "Then it sends your link:"}</p>
        <div className="review-quotes">
          <ReviewQuote
            text={delivery.text.trim() || "(no message yet)"}
            link={delivery.url ? <a href={delivery.url} target="_blank" rel="noreferrer" className="text-link">{delivery.url}</a> : "No link yet"}
            button={delivery.buttonLabel?.trim() || undefined}
          />
        </div>
      </ReviewBeat>
      <ReviewBeat icon={<CalendarClock size={17} />}>
        {limitsSentences({ dailyLimit: definition.dailySendLimit, schedule: definition.schedule, priority: automation.priority, noun: "links" })
          .map((sentence) => <p key={sentence}>{sentence}</p>)}
      </ReviewBeat>
    </ReviewStory>
  );
}

export function AutomationSummary({ automation, accountName, pageName }: {
  automation: AutomationRecord;
  /** @username it is pinned to, when known. */
  accountName?: string;
  /** Facebook Page name, when known. */
  pageName?: string;
}) {
  const facebook = automation.provider === "FACEBOOK" || Boolean(automation.facebookPageId);
  // The builder's unnamed-Page phrase points at its step 1; here there is no step 1.
  const place = facebook && !pageName ? "your Facebook Page" : channelPhrase(facebook ? "FACEBOOK" : "INSTAGRAM", facebook ? pageName : accountName);
  const definition = automation.definition;
  if (definition.version === 2) return <CampaignStory automation={automation} definition={definition} place={place} />;
  return <ClassicStory automation={automation} definition={definition} facebook={facebook} place={place} />;
}
