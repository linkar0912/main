import heroScenes from "./hero-scenes.json";
import { getSeoPage, seoCollections } from "./index";
import type { SeoCollection, SeoTopic } from "./types";

/*
 * Image slots: reserved photo files for every non-hero picture on the SEO
 * pages. ChatGPT generates them later from the prompts below and drops them at
 * `src`; until a file exists the page shows a placeholder. The hero photo is
 * never reused in a slot, and each prompt asks for a different scene from the
 * page's hero.
 */

export type ImageSlotKey = "card" | "overview" | "benefit-1" | "benefit-2" | "benefit-3" | "benefits" | "example-post" | "statement" | "cta";
/** No slug means the collection hub. */
export type ImageSlotTarget = { collection: SeoCollection; slug?: string };
export type ImageSlot = { id: string; key: ImageSlotKey; src: string; width: number; height: number; alt: string; prompt: string };

export const imageSlotKeys: readonly ImageSlotKey[] = ["card", "overview", "benefit-1", "benefit-2", "benefit-3", "benefits", "example-post", "statement", "cta"];

export const imageSlotSizes: Record<ImageSlotKey, { width: number; height: number; shape: string }> = {
  card: { width: 1200, height: 900, shape: "landscape 4:3" },
  overview: { width: 1200, height: 1200, shape: "square 1:1" },
  "benefit-1": { width: 1200, height: 900, shape: "landscape 4:3" },
  "benefit-2": { width: 1200, height: 900, shape: "landscape 4:3" },
  "benefit-3": { width: 1200, height: 900, shape: "landscape 4:3" },
  benefits: { width: 1000, height: 1250, shape: "portrait 4:5" },
  "example-post": { width: 1080, height: 1350, shape: "portrait 4:5" },
  statement: { width: 2400, height: 1200, shape: "wide 2:1" },
  cta: { width: 2400, height: 1200, shape: "wide 2:1" },
};

/** Who the page is about, where they work, and the thing people ask for. Same world as the hero, never the same shot. */
type SlotSubject = { who: string; place: string; thing: string };

const slotSubjects: Record<string, SlotSubject> = {
  features: { who: "a creator and a small business owner", place: "a bright shared studio", thing: "a phone, a laptop and an open notebook on a shared worktable" },
  solutions: { who: "a neighbourhood shop owner", place: "a small shop on a busy street", thing: "a shopfront display arranged for the morning" },
  templates: { who: "a creative strategist", place: "a planning studio", thing: "blank planning cards laid out in a neat sequence on a desk" },

  "features/instagram-comment-to-dm": { who: "a tutorial creator", place: "a small recording studio", thing: "a printed launch checklist with blank lines, clipped to a board beside a notebook" },
  "features/instagram-dm-automation": { who: "a stationery shop owner", place: "a small stationery shop", thing: "a tidy stack of notebooks and a parcel wrapped in plain paper for a custom order" },
  "features/instagram-keyword-replies": { who: "a café owner", place: "a modern espresso bar", thing: "a folded café menu card, its text out of focus, beside a fresh cup of coffee" },
  "features/instagram-reel-comment-automation": { who: "a videographer", place: "a grey filming studio", thing: "an unbranded structured everyday bag styled on a plinth for a product Reel" },
  "features/instagram-story-reply-automation": { who: "a beauty creator", place: "a minimal makeup vanity corner", thing: "a limited-time skincare set of unbranded bottles arranged on a tray" },
  "features/instagram-story-mention-replies": { who: "a florist", place: "an airy flower studio", thing: "a hand-tied bouquet wrapped in plain paper, ready for a customer" },
  "features/instagram-first-message-welcome": { who: "a coworking space host", place: "a welcoming coworking lounge", thing: "a welcome table with a plant, a water carafe and a stack of plain guide booklets" },
  "features/instagram-email-capture": { who: "a writer", place: "a quiet home library", thing: "a printed checklist with empty boxes next to an open journal" },
  "features/instagram-follow-gate": { who: "an illustrator", place: "an artist's studio", thing: "a fan of printed illustration practice sheets with simple line drawings" },
  "features/instagram-lead-qualification": { who: "a business consultant", place: "a glass-walled meeting room", thing: "a notebook open to a blank page with a pen and a cup of tea" },
  "features/instagram-dm-follow-ups": { who: "an independent course creator", place: "a calm apartment workspace", thing: "a printed course timetable with blank lines beside a closed laptop" },
  "features/instagram-human-handoff": { who: "a customer support team", place: "a bright help desk", thing: "an order parcel being checked against a plain packing slip" },
  "features/instagram-link-tracking": { who: "a marketing analyst", place: "a clean studio office", thing: "a paper appointment planner with blank time slots next to a coffee" },
  "features/instagram-automation-analytics": { who: "a startup founder", place: "a midnight-blue office", thing: "plain sticky notes arranged in three columns on a glass wall" },
  "features/instagram-reply-ab-testing": { who: "a copywriter", place: "a quiet studio table", thing: "two plain note cards side by side, one slightly longer than the other" },
  "features/no-code-instagram-flow-builder": { who: "a product designer", place: "a concrete design studio", thing: "blank cards laid out left to right and joined by thin string" },
  "features/instagram-contact-management": { who: "a small-team manager", place: "an organised office", thing: "a neat row of folders with blank tabs and a small card index box" },
  "features/facebook-comment-auto-reply": { who: "a bookshop owner", place: "an independent bookshop", thing: "the bookshop door propped open in the morning with a table of new arrivals outside" },
  "features/facebook-keyword-comment-replies": { who: "a ceramics maker", place: "a ceramics studio", thing: "a row of handmade off-white cups with small blank price tags" },
  "features/facebook-post-specific-replies": { who: "a launch coordinator", place: "a product photography workspace", thing: "a new product beside its plain box on a clean surface" },

  "solutions/content-creators": { who: "a content creator", place: "a creative home studio", thing: "a camera beside a laptop showing an abstract warm-toned photo with no interface visible" },
  "solutions/online-coaches": { who: "a professional coach", place: "a private consulting room", thing: "a programme booklet with blank pages and a pen on a round table" },
  "solutions/course-creators": { who: "a course instructor", place: "a recording classroom", thing: "a printed syllabus with blank lines beside a tablet and a small microphone" },
  "solutions/ecommerce-brands": { who: "an ecommerce founder", place: "a neat fulfilment room", thing: "a folded cotton shirt on a plain card with its size tag turned away" },
  "solutions/small-businesses": { who: "a plant shop owner", place: "a small plant shop", thing: "a shelf of potted houseplants in soft Sunday-morning light" },
  "solutions/social-media-agencies": { who: "an agency team", place: "a contemporary agency studio", thing: "a campaign mood board with photos and blank cards pinned up" },
  "solutions/affiliate-creators": { who: "a product review creator", place: "a product curation table", thing: "an unbranded structured bag styled for a review shot with headphones beside it" },
  "solutions/podcasters": { who: "a podcaster", place: "a podcast booth", thing: "a microphone, headphones and an episode run sheet with blank lines" },
  "solutions/newsletter-creators": { who: "a newsletter author", place: "a quiet writing nook", thing: "an open notebook with loose abstract pen marks beside a mug" },
  "solutions/fitness-coaches": { who: "a fitness coach", place: "a modern gym", thing: "a rolled mat, a water bottle and a programme sheet with empty boxes" },
  "solutions/beauty-brands": { who: "a beauty brand founder", place: "a beauty product studio", thing: "an unbranded glass serum bottle beside a few swatches of foundation shades" },
  "solutions/fashion-brands": { who: "a fashion designer", place: "a boutique atelier", thing: "a styled outfit on a rail: a cream blazer over indigo trousers" },
  "solutions/restaurants-cafes": { who: "a café owner", place: "a neighbourhood café", thing: "a table set for two with a folded menu card and fresh pastries" },
  "solutions/photographers": { who: "a portrait photographer", place: "a portrait studio", thing: "a camera, a spare lens and a few printed proofs lying face down" },
  "solutions/event-organizers": { who: "an event organiser", place: "an event venue", thing: "rows of cream chairs set up for a workshop in morning light" },
  "solutions/real-estate-teams": { who: "a property agent", place: "a bright modern apartment", thing: "an open-plan living room styled for a listing video" },
  "solutions/travel-creators": { who: "a travel creator", place: "a seaside guesthouse", thing: "a paper map, a compact camera and a backpack on a terrace table" },
  "solutions/education-businesses": { who: "a tutor", place: "a modern learning studio", thing: "a weekend workshop table set with plain notebooks and pencils" },
  "solutions/local-service-businesses": { who: "an installation professional", place: "a tidy workshop", thing: "a tool case, a measuring tape and mounting hardware laid out for a job" },
  "solutions/digital-product-sellers": { who: "a digital designer", place: "a creative studio desk", thing: "a laptop showing a grid of abstract colourful template thumbnails with no legible text" },

  "templates/comment-guide-delivery": { who: "a craft tutorial creator", place: "a maker's desk", thing: "a finished paper craft project beside a picture-only step-by-step guide" },
  "templates/reel-shopping-link": { who: "a leather accessory maker", place: "a boutique display corner", thing: "a dark unbranded leather bag on a plinth, lit for a Reel" },
  "templates/story-offer-reply": { who: "a boutique owner", place: "a small boutique", thing: "a small product display with a plain card turned away from the camera" },
  "templates/story-mention-thank-you": { who: "a bakery owner", place: "an artisan bakery", thing: "a box of pastries being handed across the counter to a customer" },
  "templates/first-message-welcome": { who: "a ceramic artist", place: "a ceramic studio", thing: "a set of glazed bowls drying on a wooden shelf" },
  "templates/dm-price-list": { who: "a freelance architect", place: "a drafting studio", thing: "a white architectural model beside a closed portfolio" },
  "templates/dm-business-hours": { who: "a salon owner", place: "a calm salon", thing: "the salon entrance in the morning as the lights come on" },
  "templates/dm-shipping-faq": { who: "a homewares seller", place: "a dispatch room", thing: "plain cartons and a rolled throw being packed for delivery" },
  "templates/email-resource-delivery": { who: "a productivity creator", place: "a window nook", thing: "a printed planner page with empty checkboxes and a pen" },
  "templates/course-enquiry": { who: "a language instructor", place: "a teaching studio", thing: "headphones, a tablet and a stack of plain workbooks" },
  "templates/webinar-registration": { who: "a workshop presenter", place: "a home recording setup", thing: "a webcam, a microphone and a ring light ready for a live session" },
  "templates/collaboration-intake": { who: "a partnership manager", place: "a café meeting table", thing: "two coffees and an open notebook with blank pages between two chairs" },
  "templates/giveaway-dm-entry": { who: "a handmade gift shop owner", place: "a gift shop", thing: "a wrapped gift box tied with a magenta ribbon" },
  "templates/giveaway-comment-confirmation": { who: "a lifestyle creator", place: "a home studio", thing: "a giveaway prize parcel styled on a table with dried flowers" },
  "templates/follow-gated-freebie": { who: "a music educator", place: "a music studio", thing: "an acoustic guitar and a printed chord sheet showing only diagrams" },
  "templates/lead-qualification": { who: "an interior design consultant", place: "a consultation studio", thing: "fabric samples and a small room model on a table" },
  "templates/booking-link": { who: "a portrait studio owner", place: "a studio reception", thing: "an open planner with blank time slots beside a camera bag" },
  "templates/offer-follow-up": { who: "an independent shop founder", place: "a small shop", thing: "a curated offer bundle tied with twine on the counter" },
  "templates/support-handoff": { who: "a customer care team", place: "a modern help desk", thing: "a headset beside a laptop with a softly blurred screen" },
  "templates/dm-link-menu": { who: "a restaurant owner", place: "a small restaurant", thing: "a folded menu, a reservation book and a water glass on a table" },
  "templates/facebook-product-faq": { who: "a bicycle shop owner", place: "a bicycle shop", thing: "a polished city bicycle on a display stand" },
  "templates/facebook-opening-hours": { who: "a book café owner", place: "a book café", thing: "the café's reading tables in morning light before opening" },
  "templates/facebook-giveaway-reply": { who: "a board game shop founder", place: "a board game shop", thing: "a wrapped prize parcel beside plain unbranded game boxes" },
  "templates/facebook-support-acknowledgement": { who: "a customer support lead", place: "a retail back office", thing: "a returns shelf of plain boxes with their labels turned away" },
};

type TopicMoments = { request: string; benefits: readonly [string, string, string]; statement: string; cta: string };

/* Scene hints per topic. Benefit moments read after the subject: "a florist arranging…". */
const topicMoments: Record<SeoTopic | "hub", TopicMoments> = {
  comments: { request: "new comment on the latest post", benefits: ["reading a fresh comment thread on a phone between takes", "packing away the filming gear with the day's work done", "sharing a laugh with a friend over a viewer's request"], statement: "the space between shoots, lights still warm", cta: "stepping back to admire a finished shoot" },
  messages: { request: "customer question", benefits: ["serving a customer at the counter while the phone rests nearby", "taking an unhurried tea break with the phone face down", "handing a finished order to a smiling customer"], statement: "a calm moment before customers arrive", cta: "switching off the lights at closing time with a relaxed smile" },
  stories: { request: "Story reply", benefits: ["filming a vertical clip with a phone on a small tripod", "smiling at a reply in the middle of the morning routine", "arranging products for the next Story"], statement: "soft daylight across the set before filming", cta: "laughing while looking back over the day's clips" },
  leads: { request: "new enquiry", benefits: ["writing notes from a new enquiry into a notebook", "meeting a new client for a first conversation", "planning tomorrow's appointments over coffee"], statement: "an empty meeting table ready for a first conversation", cta: "closing the notebook after a good first conversation" },
  followers: { request: "follower's request", benefits: ["preparing a free resource for the community", "looking through printed work samples", "recording a short thank-you clip for followers"], statement: "the workspace where the community resources are made", cta: "packing a small parcel for the community" },
  team: { request: "conversation that needs a person", benefits: ["sharing one screen to pick up a conversation together", "handing a customer conversation to a colleague with a calm word", "talking through the day at a short stand-up"], statement: "the shared desk between shifts", cta: "heading out together after a calm shift" },
  insights: { request: "weekly campaign review", benefits: ["comparing two printed layouts side by side", "pinning plain notes into columns on a wall", "doing a calm end-of-week review with a coffee"], statement: "a quiet office in late afternoon light", cta: "closing the laptop after a useful weekly review" },
  facebook: { request: "public question under a Page post", benefits: ["greeting a regular customer at the counter", "arranging the shop display before opening", "reading a question with a friendly expression"], statement: "the shop floor just before opening", cta: "chatting with a customer at the door" },
  hub: { request: "message from a customer", benefits: ["working through the morning with the phone nearby", "talking with a customer in person", "planning the week on paper"], statement: "a calm workspace in morning light", cta: "wrapping up a good day's work" },
};

const heroAlts = new Map(heroScenes.map((scene) => [scene.key, scene.alt]));

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const commonPrompt = "Use case: photorealistic-natural. Asset type: an original website photograph for Linkar, an Instagram automation SaaS for Indian creators and small businesses. Natural, authentic Indian people with realistic hands, a calm real work moment rather than a posed advertisement, restrained natural colours and natural light. No words, no logos, no watermark, no baked-in UI, no chat bubbles, no legible text on screens, paper or packaging.";

type SlotContext = { key: string; label: string; subject: SlotSubject; moments: TopicMoments; benefitTitles: readonly string[]; facebook: boolean };

function contextFor(target: ImageSlotTarget): SlotContext {
  if (!target.slug) {
    const hub = seoCollections[target.collection];
    return { key: target.collection, label: hub.label, subject: slotSubjects[target.collection], moments: topicMoments.hub, benefitTitles: hub.guidance.map(([title]) => title), facebook: false };
  }
  const key = `${target.collection}/${target.slug}`;
  const page = getSeoPage(target.collection, target.slug);
  if (!page) throw new Error(`Unknown SEO page for image slot: ${key}`);
  const subject = slotSubjects[key] ?? { who: "an Indian small business owner", place: "a small workspace", thing: `the thing people ask about in ${page.label}` };
  return { key, label: page.label, subject, moments: topicMoments[page.topic], benefitTitles: page.benefits.map(([title]) => title), facebook: page.topic === "facebook" };
}

function sceneFor(key: ImageSlotKey, context: SlotContext): { scene: string; alt: string } {
  const { who, place, thing } = context.subject;
  const { moments } = context;
  switch (key) {
    case "card":
      return { scene: `A close, tactile detail photograph in ${place}: ${thing}, with a hand reaching in at the edge of the frame as if ${who} is mid-task. Shallow depth of field; no face needed.`, alt: capitalise(thing) };
    case "overview":
      return { scene: `A square candid photograph of ${who} in a different corner of ${place}, mid-task, glancing at a phone as a ${moments.request} arrives. Subject slightly right of centre; keep the lower-left quarter calm and uncluttered for a floating card.`, alt: `${capitalise(who)} glancing at a ${moments.request} mid-task` };
    case "benefit-1":
    case "benefit-2":
    case "benefit-3": {
      const index = Number(key.slice(-1)) - 1;
      const idea = context.benefitTitles[index];
      return {
        scene: `A candid photograph of ${who} ${moments.benefits[index]} in ${place}.${idea ? ` The idea to convey without any words: ${idea.toLowerCase().replace(/\.$/, "")}.` : ""}`,
        alt: `${capitalise(who)} ${moments.benefits[index]}`,
      };
    }
    case "benefits":
      return { scene: `A portrait-format environmental photograph of ${who} absorbed in the work itself in ${place}, phone put away, candid and unposed, with soft depth behind them.`, alt: `${capitalise(who)} at work in ${place}` };
    case "example-post":
      return { scene: `The photo ${who} would publish as ${context.facebook ? "a Facebook Page post" : "an Instagram post"} that people reply to: ${thing}, photographed simply in ${place}. A clean product or scene shot with no one looking at a phone.`, alt: `${capitalise(thing)}, photographed for a post` };
    case "statement":
      return { scene: `A wide environmental photograph of ${place}: ${moments.statement}, with ${who} small in the frame. Keep the centre third calm, low in detail and fairly dark so a white headline can sit on it.`, alt: `${capitalise(place)} with ${who} at work` };
    case "cta":
      return { scene: `A wide, warm photograph of ${who} ${moments.cta} in ${place}. Keep the centre third uncluttered and mid-dark so a headline and floating message bubbles can sit on top.`, alt: `${capitalise(who)} ${moments.cta}` };
  }
}

/** The public path a slot's file lives at. */
export function imageSlotPath(target: ImageSlotTarget, key: ImageSlotKey): string {
  return `/marketing/seo/slots/${target.collection}/${target.slug ?? "index"}/${key}.webp`;
}

export function seoImageSlot(target: ImageSlotTarget, key: ImageSlotKey): ImageSlot {
  const context = contextFor(target);
  const size = imageSlotSizes[key];
  const { scene, alt } = sceneFor(key, context);
  const hero = heroAlts.get(context.key);
  const avoid = hero ? ` This page's hero photo already shows "${hero}". Make this a different moment, framing and part of the setting; do not repeat that composition or that person's pose.` : "";
  return {
    id: `${target.collection}/${target.slug ?? "index"}/${key}`,
    key,
    src: imageSlotPath(target, key),
    width: size.width,
    height: size.height,
    alt,
    prompt: `${commonPrompt} Produce one ${size.shape} photograph (${size.width} × ${size.height}) for the "${context.label}" page. Scene: ${scene}${avoid}`,
  };
}
