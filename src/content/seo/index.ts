import { featurePages } from "./features";
import { solutionPages } from "./solutions";
import { templatePages } from "./templates";
import type { ContentBlock, SeoCollection, SeoPage, SeoTopic } from "./types";
export { SEO_CONTENT_UPDATED, SEO_HERO_IMAGE, seoPagePath } from "./types";
export type { SeoCollection, SeoPage, SeoTopic } from "./types";

export const seoPages: readonly SeoPage[] = [
  ...featurePages.map((page): SeoPage => ({ ...page, collection: "features" })),
  ...solutionPages.map((page): SeoPage => ({ ...page, collection: "solutions" })),
  ...templatePages.map((page): SeoPage => ({ ...page, collection: "templates" })),
];

export function getSeoPages(collection: SeoCollection): readonly SeoPage[] {
  return seoPages.filter((page) => page.collection === collection);
}

export function getSeoPage(collection: SeoCollection, slug: string): SeoPage | undefined {
  return seoPages.find((page) => page.collection === collection && page.slug === slug);
}

export function getRelatedSeoPages(page: SeoPage): readonly SeoPage[] {
  return page.related.flatMap((path) => {
    const related = seoPages.find((candidate) => `/${candidate.collection}/${candidate.slug}` === path);
    return related && related !== page ? [related] : [];
  });
}

export const seoTopics: Record<SeoTopic, string> = {
  comments: "Comments to conversations", messages: "Helpful DM replies", stories: "Story conversations",
  leads: "Resources and enquiries", followers: "Follower resources", team: "Your team’s next reply",
  insights: "Campaign insights", facebook: "Facebook Page replies",
};

export const seoCollections: Record<SeoCollection, {
  label: string; title: string; headline: string; description: string; intro: string; guidance: readonly ContentBlock[];
}> = {
  features: {
    label: "Features", title: "Instagram & Facebook Automation Features · Linkar",
    headline: "Make every next reply a useful one.",
    description: "Explore Linkar’s Instagram and Facebook Page automation features. Send requested links, answer messages, collect enquiries, and review campaign activity.",
    intro: "Linkar connects a supported incoming interaction to the answer you prepare. Start with the part of your inbox that repeats: a resource request under a Reel, a question about your opening hours, or an enquiry about your service. Choose the channel and interaction first, then build the smallest useful journey. These feature guides explain what each capability does, how to configure it, and what to test before relying on it in a campaign.",
    guidance: [
      ["Begin with the person’s request", "A comment, an incoming DM, and a Story mention are different interactions. Give each one a response that fits its context. A resource requested under a post should receive that resource; a support question should reach a useful help route. Keep the language in your caption consistent with the reply."],
      ["Choose the channel deliberately", "Instagram supports private comment replies and supported conversation journeys. Linkar’s Facebook Page automations focus on public comment replies. Public wording needs to make sense to everyone reading the thread, and it should never ask for personal details. Check the capabilities shown for the actual connected account before planning a flow."],
      ["Test the destination as well as the message", "A successful reply is only useful if its link, collection step, or handoff works. Try the expected interaction and an exception from another account. Inspect your activity to confirm delivery, and use the destination’s own records for completed purchases or bookings. Review the flow again whenever the offer changes."],
    ],
  },
  solutions: {
    label: "Solutions", title: "Instagram Automation for Creators & Businesses · Linkar",
    headline: "More time for the work you came here to do.",
    description: "Find practical Instagram automation workflows for creators, shops, coaches, and service businesses. Explore audience-specific examples and setup guides in Linkar.",
    intro: "An automation should fit the way your business actually works. A creator delivering a preset needs a different journey from a restaurant sharing a menu or a coach preparing an enquiry. These solution guides focus on the requests each audience receives, the information worth collecting, and the point where a person should take over. Use them to plan a useful first workflow, then adapt the copy and destinations to your own offer.",
    guidance: [
      ["Start with a real recurring question", "Look at recent conversations before choosing a campaign. Find the answer you already send repeatedly and prepare it clearly. A maintained price page, a resource link, or a programme overview is often a better first automation than an elaborate journey built around a hypothetical customer."],
      ["Keep business commitments with the right process", "A sent booking link is not a reserved appointment. A product destination is not a completed sale. Linkar handles supported replies and configured collection; your store, scheduling tool, admissions process, or team confirms the final outcome. Each guide makes that handoff visible so your message can set an accurate expectation."],
      ["Make maintenance part of the workflow", "Assign someone to review messages and destinations when prices, dates, or availability change. Keep personal enquiries available to your team and check handed-off conversations regularly. Useful automation reduces repeated typing while preserving the judgement and care that belong to your business."],
    ],
  },
  templates: {
    label: "Workflow recipes", title: "Instagram & Facebook Automation Templates · Linkar",
    headline: "A good first reply starts with a clear plan.",
    description: "Browse 24 Instagram and Facebook Page workflow recipes for Linkar. Get sample messages, setup steps, and downloadable plans to adapt to your own campaigns.",
    intro: "These recipes are practical starting points for a conversation you can build in Linkar. Each includes a sample message, a channel-specific setup plan, testing advice, and a downloadable text version. Replace the sample with your own offer, links, and response expectations. A recipe is a plan you adapt and test; it does not supply a freebie, create an external booking system, or publish an automation on your behalf.",
    guidance: [
      ["Choose the interaction before the copy", "Use a comment recipe for a request under a post, an incoming DM recipe for a message, and a Story recipe for the relevant Story event. Facebook Page recipes create public comment replies. The channel decides which next steps are supported, so do not assume every recipe can run unchanged everywhere."],
      ["Replace every destination and promise", "Bring your own resource, product page, support route, or booking link. Open each destination as a new visitor and check access from a phone. Review sample acknowledgements carefully: receiving an enquiry is different from confirming a place, verifying a giveaway entry, or resolving a support issue."],
      ["Test a normal route and an exception", "Try the requested keyword, an unrelated message, and any collection or eligibility step. For follower campaigns, inspect both follower states. For follow-ups, check delivery eligibility and skipping. Keep the downloaded plan with your campaign notes so another team member can understand the flow when the offer changes."],
    ],
  },
};

export const topicGuides: Record<SeoTopic, { title: string; paragraphs: readonly string[] }> = {
  comments: {
    title: "Plan the whole comment journey",
    paragraphs: [
      "A comment campaign has several distinct parts: the public instruction, the matching comment, the requested private reply, and any supported interaction that continues the conversation. Make the promise visible before the person comments. Select the intended posts so a campaign does not answer beneath unrelated content.",
      "A private reply does not grant unlimited permission for later messages. Further steps depend on the person’s interaction and the supported messaging rules. Test a fresh request from another account, inspect delivery, and open the resource as a visitor. Keep older posts under review when their offers change.",
    ],
  },
  messages: {
    title: "Keep incoming message replies useful",
    paragraphs: [
      "Use the words people actually send, then choose a matching mode that suits the request. An exact campaign code and a broader question keyword serve different purposes. Test an expected request, a longer sentence, and an unrelated message. Review other active flows so the same incoming question does not produce several competing answers.",
      "Prepared replies should answer known questions with information you maintain. They are not a reason to improvise product claims or make custom commitments. Leave a clear route to your team and respect the supported messaging window. If the destination changes, update and retest the reply before the next campaign.",
    ],
  },
  stories: {
    title: "Choose the right Story interaction",
    paragraphs: [
      "A Story reply is a response to your own Story. A Story mention arrives when another person includes your account in theirs. These interactions deserve separate triggers and wording. Use a specific request word for an offer, and a short acknowledgement for a mention. Supported event availability can depend on account and privacy context.",
      "Stories and highlights can outlive a promotion. Keep the offer destination current and remove expired instructions. A mention does not automatically establish permission to reuse a customer’s content; ask and review that separately. Test from another account, including any general DM flows that may also match the incoming interaction.",
    ],
  },
  leads: {
    title: "Collect the details that help your next reply",
    paragraphs: [
      "Explain the purpose before asking for an email or an additional answer. Linkar can validate an address’s format and save configured conversational fields with a contact. Format validation does not prove mailbox ownership. A short intake should give your team relevant context, while retry and exit messages keep the process understandable.",
      "A saved address is not blanket permission for recurring marketing. Keep requested resource delivery and newsletter enrollment distinct, and test any external handoff you configure. Collect only the information needed for the enquiry. Review the completed record and fulfillment step yourself before calling the campaign a working lead journey.",
    ],
  },
  followers: {
    title: "Make follower requirements transparent",
    paragraphs: [
      "A supported follow-gated campaign begins with a requested comment journey, an opening message, and an opt-in tap. The follow check happens within that journey. Following an account alone is not a trigger for unsolicited delivery. State the follower requirement in the offer before asking the person to comment.",
      "Check the capability available to the connected account and test both follower states. A not-following message should explain the next step and offer the supported recheck. Verify final resource access as well as the opening reply. If the check is unavailable, revise the campaign rather than promising a journey you have not tested.",
    ],
  },
  team: {
    title: "Make the personal reply part of the plan",
    paragraphs: [
      "Choose the moments when a person needs to take over: a complaint, a bespoke request, or a question beyond your prepared information. Handoff should preserve the conversation and pause automatic replies so the team can answer without competing campaign messages. Acknowledge the request with realistic expectations about working hours.",
      "Assign the inbox an owner and test the transition. Someone should be able to find the context and continue without asking the customer to repeat everything. Decide when automation may resume and verify that unrelated keywords do not interrupt active personal assistance. A handoff prepares support; it does not guarantee an instant resolution.",
    ],
  },
  insights: {
    title: "Read each stage on its own terms",
    paragraphs: [
      "A matching interaction, a delivered message, and a tracked visit are different observations. Review individual automations over comparable time periods and investigate delivery issues before treating missing activity as low interest. Changes in post reach, offer timing, and destinations can affect results independently of the reply’s wording.",
      "Use the external destination’s records for purchases, confirmed bookings, and enrollments. For reply experiments, change one variable and allow enough activity to make the comparison useful. A small sample or one extra click does not prove a universal winner. Keep campaign notes so your team can explain what changed and what the evidence actually shows.",
    ],
  },
  facebook: {
    title: "Write for a public Facebook thread",
    paragraphs: [
      "Linkar’s Facebook Page comment automations post public replies. They should not be described as Messenger chatbots or private DM journeys. Use wording that makes sense to other readers, choose relevant keywords or selected posts, and keep account-specific details out of the response. Never ask people to post private contact or payment information under a comment.",
      "Test a matching question and an unrelated comment in the actual thread. Point to a maintained destination when details can change, and use your real private support process for individual issues. An automatic acknowledgement does not prove a support ticket exists, a giveaway entry is eligible, or a purchase has been completed.",
    ],
  },
};

export function seoRecipeMarkdown(page: SeoPage): string {
  return [
    `# ${page.label}`, page.intro,
    `## Channel\n\n${page.topic === "facebook" ? "Facebook Page: public comment replies" : "Instagram: supported incoming interactions"}`,
    "## Setup", ...page.steps.map(([title, body], index) => `${index + 1}. ${title}\n\n${body}`),
    `## Example incoming request\n\n${page.example.incoming}`,
    `## Sample reply to customise\n\n${page.example.reply}`,
    `## Next step\n\n${page.example.next}\n\n${page.example.note}`,
    `## ${page.tip[0]}\n\n${page.tip[1]}`,
    `## ${topicGuides[page.topic].title}\n\n${topicGuides[page.topic].paragraphs.join("\n\n")}`,
    "Replace all sample wording and destinations. This is a workflow plan, not an importable or already-published automation.",
  ].join("\n\n") + "\n";
}
