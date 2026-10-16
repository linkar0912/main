import { describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";
import { isOptOutCommand, processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";

vi.mock("../mailer", () => ({ sendEmail: vi.fn().mockResolvedValue({ delivered: true, id: "email_1" }) }));
vi.mock("./send-rate-limiter", () => ({ checkSendRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));

const TOKEN_KEY = "a".repeat(64);

describe("isOptOutCommand", () => {
  it.each([
    // The original exact phrases keep working.
    "stop", "unsubscribe", "optout", "opt-out", "remove me", "stop messaging",
    // Case, surrounding punctuation, whitespace and emoji.
    "Stop!", "STOP.", " stop ", "Stop!!!", "stop?", "...stop...", "\"stop\"", "stop 🙏", "🛑 STOP 🛑", "stop ✋️", "\tStop\n", "ＳＴＯＰ",
    "Opt Out", "OPT-OUT!", "opt me out", "Stop, stop", "STOP ALL", "stopall",
    // A stray question mark on a bare keyword still counts.
    "STOP?", "unsubscribe?", "stop all?",
    // Emoji that fit a real request: stop signs, hands, smiles, ticks and annoyed or angry faces.
    "stop 🙏🏽", "❌ STOP ❌", "stop 🚫", "stop 🔕", "🙅‍♀️ stop", "STOP 😡", "STOP 💢", "stop messaging me 🤬", "👋 unsubscribe",
    "stop 🙂", "stop :)", "stop 👍", "STOP🇮🇳",
  ])("recognises %j", (text) => {
    expect(isOptOutCommand(text)).toBe(true);
  });

  it.each([
    "please stop", "Please stop!", "pls stop", "stop please", "stop now", "please, please stop.",
    "stop messaging me", "Stop messaging me!", "stop texting me", "stop sending me messages", "stop sending these",
    "stop the messages", "stop all messages", "stop spamming me", "stop these notifications",
    "unsubscribe me", "UNSUBSCRIBE", "I want to unsubscribe", "I'd like to opt out",
    "remove me from your list", "Remove me from this list.", "take me off your list",
    "no more messages", "No more messages, please.", "no more spam", "no more dms",
    "don't message me", "Don't message me again.", "dont text me", "do not contact me", "never message me again",
    "don’t send me any more messages", "do not send me anything", "I don't want these messages", "I do not want any more messages",
    "leave me alone", "Leave me alone!!",
  ])("recognises the English phrasing %j", (text) => {
    expect(isOptOutCommand(text)).toBe(true);
  });

  it.each([
    "band karo", "Band karo!", "BAND KARO", "band kar do", "band kardo yaar", "bandh karo", "bnd kro", "band kijiye",
    "messages band karo", "message band kar do please", "ye messages band karo", "msg band karo bhai", "stop karo", "messages stop kar do",
    "message bhejna band karo", "mujhe message bhejna band karo",
    "mat bhejo", "message mat bhejo", "Mujhe message mat bhejo.", "plz message mat bhejo", "aur message mat bhejna", "dobara message mat bhejna",
    "message na bheje", "message mat karo", "mujhe msg mat karo", "dm mat karo", "spam mat karo",
    "mujhe pareshan mat karo", "disturb mat karo", "messages bas karo", "ye msg bas kar do",
    "unsubscribe kar do", "mujhe unsubscribe karo", "mujhe list se hatao", "list se hata do", "mujhe remove kar do",
    "message nahi chahiye", "mujhe messages nahi chahiye", "ab message mat bhejo", "message band karo na",
  ])("recognises the Hinglish phrasing %j", (text) => {
    expect(isOptOutCommand(text)).toBe(true);
  });

  it.each([
    "बंद करो", "बंद करें", "बन्द करो", "कृपया बंद कर दीजिए", "मैसेज बंद करो", "मैसेज भेजना बंद करो",
    "मैसेज मत भेजो", "मुझे मैसेज मत भेजो।", "कृपया मैसेज मत भेजिए", "मैसेज न भेजें", "मत भेजो", "मुझे मैसेज मत करो",
    "मुझे परेशान मत करो", "परेशान न करें", "मैसेज बस करो", "अनसब्सक्राइब", "मुझे लिस्ट से हटाओ", "मुझे मैसेज नहीं चाहिए", "मैसेज रोको",
    // Zero-width joiners that some Hindi keyboards insert do not break matching.
    "मैसेज‍ मत भेजो",
  ])("recognises the Devanagari phrasing %j", (text) => {
    expect(isOptOutCommand(text)).toBe(true);
  });

  it.each([
    // Sincere requests, often from annoyed people: no emoji cancels a phrase
    // that can only mean opt-out.
    "Please unsubscribe me 🙂", "unsubscribe 👍", "unsubscribe :)", "unsubscribe ✅", "unsubscribe 😂",
    "remove me from your list 😊", "take me off your list 🙂", "opt out 👍", "no more messages please 🙂",
    "मैसेज मत भेजो 🙂", "message mat bhejo 😍", "messages band karo 😂", "STOP MESSAGING ME 😤", "stop messaging me 🙄",
    "stop sending me messages ⚠️", "don't message me 😒",
    // Forms that can be a joke still count with an emoji that is not playful.
    "please stop 😞", "leave me alone 😑", "STOP❗", "band karo 🙏", "mat bhejo 😠",
  ])("recognises the sincere request %j whatever the emoji", (text) => {
    expect(isOptOutCommand(text)).toBe(true);
  });

  it.each([
    "Please stop???", "please stop?", "stop messaging me?!", "stop sending me messages??", "Unsubscribe me please?",
    "stop messaging me pls?", "remove me from your list?", "don't message me again?!", "leave me alone?!",
  ])("recognises the English request %j despite frustrated question marks", (text) => {
    expect(isOptOutCommand(text)).toBe(true);
  });

  it.each([
    // Ordinary sentences that merely contain an opt-out word.
    "where is the bus stop", "Where is the bus stop?", "where do we stop by for pickup?", "can you stop by the store", "stop by tomorrow",
    "don't stop", "I can't stop smiling", "nonstop", "stopwatch", "stop the music", "please stop by",
    "stop the order", "dukaan band karo", "light band karo", "order band karo",
    "how do I unsubscribe?", "unsubscribe from what?", "remove me from the group chat?", "no more stock?", "message me", "please send the guide",
    // Vague replies are not treated as a permanent opt-out. "stop it" and
    // friends are banter on a story as often as a request.
    "no", "cancel", "not interested", "no more", "please", "thanks",
    "stop it", "stop that", "stop this", "stop it yaar", "stop it bhai", "stop everything",
    // Hinglish and Hindi sentences about other things.
    "band", "mat", "band ka naam kya hai", "dukaan kab band hoti hai", "shop band hai kya?", "message karo", "mujhe message karo",
    "price bhejo", "mujhe details bhejo", "message bhejo na", "hatao", "kab tak band rahega",
    "दुकान कब बंद होती है", "मुझे मैसेज करो", "बंद", "मैसेज भेजो",
    // Empty and punctuation-only input.
    "", "   ", "!!!", "🙏",
  ])("does not treat %j as an opt-out", (text) => {
    expect(isOptOutCommand(text)).toBe(false);
  });

  it.each([
    "stop it 😂", "STOP 😂😂", "STOP 😂😂😂", "stop 🤣🤣", "stop it 🥰", "stop ❤️", "stop pls 😭😭", "stop 💀", "please stop 😆",
    "stop 😉", "stop 😜", "stop 😘", "stop yaar 😂", "leave me alone 😂", "don't bother me 😜", "stop bothering me 🤣",
    "bas karo bhai 😂", "bas karo yaar 🤣🤣", "bas kar do bhai 😂", "बस करो यार 😂", "band karo 😂", "band karo bhai 🤣",
    "mat bhejo 😂", "messages bas karo 😂", "बंद करो 😂", "मत भेजो 😂", "pareshan mat karo 😜",
    "stop it :)", "stop ;-)", "stop ;)", "STOP :D", "band karo :P", "stop ^_^", "🛑 stop 😂",
  ])("reads the joking tone of %j as a normal message", (text) => {
    expect(isOptOutCommand(text)).toBe(false);
  });

  it.each(["bas karo", "bas kar do", "bas karo bhai", "बस करो", "बस करो यार"])(
    "does not treat a bare %j, often a laugh at a joke, as an opt-out",
    (text) => {
      expect(isOptOutCommand(text)).toBe(false);
    },
  );

  // English requests still count with a "?" (see above); these can really be
  // questions, and Hindi marks a yes or no question by the "?" alone.
  it.each([
    "band karo?", "बस करो?", "no more messages?", "no more messages??", "mat bhejo?", "मैसेज मत भेजो?",
    "message band karo?", "mujhe list se hatao?", "message nahi chahiye?", "बंद करें?",
  ])(
    "does not treat the question %j as an opt-out",
    (text) => {
      expect(isOptOutCommand(text)).toBe(false);
    },
  );

  it("keeps a colon before a word from reading as a text face", () => {
    expect(isOptOutCommand("stop:please")).toBe(true);
  });

  it("ignores very long messages, even when they start with stop", () => {
    expect(isOptOutCommand(`stop ${"please ".repeat(40)}`)).toBe(false);
  });
});

describe("opt-out through the runner", () => {
  const flow: FlowDefinitionV1 = {
    version: 1,
    trigger: { type: "first_contact" },
    conditions: [],
    actions: [{ type: "send_text", text: "Welcome!" }],
  };

  async function seed() {
    const repository = createMemoryRepository([{
      id: "automation_0",
      workspaceId: "workspace_a",
      name: "Welcome",
      status: "ACTIVE" as const,
      version: 1,
      priority: 1,
      definition: flow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    }]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    return repository;
  }

  function client(): AutomationRunnerClient {
    return {
      sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "private_1" }),
      sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "direct_1" }),
      replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
      sendQuickReply: vi.fn().mockResolvedValue({ message_id: "quick_1" }),
      getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
      getMedia: vi.fn(),
    };
  }

  function message(id: string, text: string): NormalizedEvent {
    return { id, accountId: "ig_1", type: "message.received", text, recipientId: "person_1", timestamp: Date.now() };
  }

  it.each(["Stop!", "please stop", "band karo", "मैसेज मत भेजो", "stop 🙏", "Please unsubscribe me 🙂", "Please stop???", "STOP MESSAGING ME 😤"])("suppresses a contact who replies %j and confirms once", async (text) => {
    const repository = await seed();
    const runnerClient = client();

    const result = await processNormalizedEvent(message("m1", text), repository, { client: runnerClient, tokenEncryptionKey: TOKEN_KEY });

    expect(result).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(runnerClient.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(runnerClient.sendDirectMessage).toHaveBeenCalledWith(
      expect.anything(),
      "person_1",
      { type: "text", text: expect.stringContaining("you won't receive any more automated messages") },
    );
    expect(runnerClient.sendDirectMessage).not.toHaveBeenCalledWith(expect.anything(), "person_1", expect.objectContaining({ text: "Welcome!" }));
    expect((await repository.getContact("workspace_a", "ig_1", "person_1"))?.suppressedAt).toBeTruthy();
  });

  it.each(["where is the bus stop", "bas karo bhai 😂", "stop it 😂", "band karo?", "stop it yaar"])(
    "keeps %j as a normal message that runs the automation",
    async (text) => {
      const repository = await seed();
      const runnerClient = client();

      await processNormalizedEvent(message("m2", text), repository, { client: runnerClient, tokenEncryptionKey: TOKEN_KEY });

      expect(runnerClient.sendDirectMessage).toHaveBeenCalledTimes(1);
      expect(runnerClient.sendDirectMessage).toHaveBeenCalledWith(expect.anything(), "person_1", { type: "text", text: "Welcome!" });
      expect((await repository.getContact("workspace_a", "ig_1", "person_1"))?.suppressedAt).toBeFalsy();
    },
  );
});
