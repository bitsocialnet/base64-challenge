import { describe, expect, it } from "vitest";
import base64Challenge, {
  MAX_LENGTH_OPTION,
  description,
  optionInputs,
  validateChallengeSettings
} from "../src/base64-challenge.js";
import type { ChallengeResultInput, CommunityChallengeSetting, GetChallengeArgsInput } from "../src/types.js";

const DEFAULT_ERROR =
  "Embedded base64 data and data: URIs aren't allowed. Upload the file to a media host and post the link instead.";

const BASE64_UNIT = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ+/8";
const base64OfLength = (length: number) => BASE64_UNIT.repeat(Math.ceil(length / BASE64_UNIT.length)).slice(0, length);
const DATA_URI_IMAGE = `data:image/png;base64,${base64OfLength(4000)}`;

const buildSettings = (params: { maxLength?: string; error?: string } = {}): CommunityChallengeSetting => {
  const options: Record<string, string> = {};
  if (params.maxLength !== undefined) options[MAX_LENGTH_OPTION] = params.maxLength;
  if (params.error !== undefined) options["error"] = params.error;
  return { name: "base64", options } as CommunityChallengeSetting;
};

type ChallengeRequestMessage = GetChallengeArgsInput["challengeRequestMessage"];
type PublicationType = "comment" | "vote" | "commentEdit" | "commentModeration" | "communityEdit";
type Publication<K extends PublicationType> = NonNullable<ChallengeRequestMessage[K]>;

// Typed against pkc-js's own challenge-time publication types, so a fixture cannot carry a field no client
// can send. The key and signature are real-length base64, which the default limit has to let through.
const COMMENT_CID = "QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR";
const PUBLIC_KEY = base64OfLength(43) + "=";
const SIGNATURE = base64OfLength(86) + "==";

const buildAuthor = (overrides: Partial<Publication<"comment">["author"]> = {}): Publication<"comment">["author"] => ({
  address: "author.bso",
  publicKey: PUBLIC_KEY,
  ...overrides
});

const withSignature = <T extends object>(unsigned: T) => ({
  ...unsigned,
  signature: {
    type: "ed25519",
    signature: SIGNATURE,
    publicKey: PUBLIC_KEY,
    signedPropertyNames: Object.keys(unsigned)
  }
});

const PUBLICATION_BASE = {
  communityName: "community.bso",
  communityPublicKey: PUBLIC_KEY,
  protocolVersion: "1.0.0",
  timestamp: 1_700_000_000
};

const buildComment = (overrides: Partial<Publication<"comment">> = {}): Publication<"comment"> =>
  withSignature({ ...PUBLICATION_BASE, author: buildAuthor(), ...overrides });

const buildCommentEdit = (overrides: Partial<Publication<"commentEdit">> = {}): Publication<"commentEdit"> =>
  withSignature({ ...PUBLICATION_BASE, author: buildAuthor(), commentCid: COMMENT_CID, ...overrides });

const buildVote = (overrides: Partial<Publication<"vote">> = {}): Publication<"vote"> =>
  withSignature({ ...PUBLICATION_BASE, author: buildAuthor(), commentCid: COMMENT_CID, vote: 1, ...overrides });

const buildCommentModeration = (
  overrides: Partial<Publication<"commentModeration">> = {}
): Publication<"commentModeration"> =>
  withSignature({
    ...PUBLICATION_BASE,
    author: buildAuthor(),
    commentCid: COMMENT_CID,
    commentModeration: { removed: true },
    ...overrides
  });

const buildCommunityEdit = (overrides: Partial<Publication<"communityEdit">> = {}): Publication<"communityEdit"> =>
  withSignature({ ...PUBLICATION_BASE, author: buildAuthor(), communityEdit: {}, ...overrides });

const runChallenge = async <K extends PublicationType>(params: {
  settings?: CommunityChallengeSetting;
  publicationType: K;
  publication: Publication<K>;
}): Promise<Extract<ChallengeResultInput, { success: boolean }>> => {
  const settings = params.settings ?? buildSettings();
  const result = await base64Challenge({ challengeSettings: settings }).getChallenge({
    challengeSettings: settings,
    challengeRequestMessage: { [params.publicationType]: params.publication } as unknown as ChallengeRequestMessage,
    challengeIndex: 0,
    community: {} as unknown as GetChallengeArgsInput["community"]
  });
  if (!("success" in result)) throw new Error("Expected a challenge result");
  return result;
};

const runComment = (comment: Partial<Publication<"comment">>, settings?: CommunityChallengeSetting) =>
  runChallenge({ publicationType: "comment", publication: buildComment(comment), ...(settings ? { settings } : {}) });

describe("the challenge file", () => {
  it("returns the hooks pkc-js expects", () => {
    const challengeFile = base64Challenge({ challengeSettings: buildSettings() });
    expect(challengeFile.type).toBe("text/plain");
    expect(challengeFile.description).toBe(description);
    expect(challengeFile.optionInputs).toBe(optionInputs);
    expect(typeof challengeFile.getChallenge).toBe("function");
    expect(typeof challengeFile.validateChallengeSettings).toBe("function");
  });

  it("declares every option the README documents", () => {
    expect(optionInputs.map((input) => input.option)).toEqual(["maxLength", "error"]);
    expect(optionInputs.find((input) => input.option === MAX_LENGTH_OPTION)?.default).toBe("512");
  });

  it("does not throw on a config validateChallengeSettings would reject", () => {
    expect(() => base64Challenge({ challengeSettings: buildSettings({ maxLength: "nope" }) })).not.toThrow();
  });
});

describe("getChallenge", () => {
  it("passes an ordinary comment, signature and key included", async () => {
    const result = await runComment({
      title: "A normal post",
      content: "Here is a link: https://example.com/a-long-article-slug-about-something-interesting-happening-today",
      link: "https://cdn.example.com/media/image.png"
    });
    expect(result).toEqual({ success: true });
  });

  it("rejects a data URI image in content", async () => {
    expect(await runComment({ content: `look ![](${DATA_URI_IMAGE})` })).toEqual({ success: false, error: DEFAULT_ERROR });
  });

  it("rejects a raw base64 run in the title", async () => {
    expect(await runComment({ title: base64OfLength(600) })).toEqual({ success: false, error: DEFAULT_ERROR });
  });

  it("rejects base64 nested in a gallery item's alt text", async () => {
    const result = await runComment({
      gallery: [{ url: "https://cdn.example.com/media/image.png", htmlTagName: "img", alt: DATA_URI_IMAGE }]
    });
    expect(result.success).toBe(false);
  });

  // author.wallets is keyed by a chain ticker, which pkc-js types as any string.
  it("rejects base64 in an object key", async () => {
    const wallet = { address: "0x0000000000000000000000000000000000000001", timestamp: 1, signature: { signature: "0x01", type: "eip191" } };
    const result = await runComment({ author: buildAuthor({ wallets: { [base64OfLength(600)]: wallet } }) });
    expect(result.success).toBe(false);
  });

  it("rejects base64 in a comment edit", async () => {
    const result = await runChallenge({
      publicationType: "commentEdit",
      publication: buildCommentEdit({ content: DATA_URI_IMAGE })
    });
    expect(result.success).toBe(false);
  });

  it("rejects base64 in a voter's display name", async () => {
    const result = await runChallenge({
      publicationType: "vote",
      publication: buildVote({ author: buildAuthor({ displayName: DATA_URI_IMAGE }) })
    });
    expect(result.success).toBe(false);
  });

  it("rejects base64 in a moderation reason", async () => {
    const result = await runChallenge({
      publicationType: "commentModeration",
      publication: buildCommentModeration({ commentModeration: { removed: true, reason: DATA_URI_IMAGE } })
    });
    expect(result.success).toBe(false);
  });

  it("rejects base64 in a community edit", async () => {
    const result = await runChallenge({
      publicationType: "communityEdit",
      publication: buildCommunityEdit({ communityEdit: { description: DATA_URI_IMAGE } })
    });
    expect(result.success).toBe(false);
  });

  it("uses the configured error", async () => {
    const result = await runComment({ content: DATA_URI_IMAGE }, buildSettings({ error: "No images in text." }));
    expect(result).toEqual({ success: false, error: "No images in text." });
  });

  it("applies the configured maxLength", async () => {
    const comment = { content: base64OfLength(200) };
    expect(await runComment(comment)).toEqual({ success: true });
    expect((await runComment(comment, buildSettings({ maxLength: "128" }))).success).toBe(false);
  });

  it("fails loudly on a maxLength saved before validation existed", async () => {
    const result = await runComment({ content: "hello" }, buildSettings({ maxLength: "10" }));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/^Invalid base64 challenge settings: maxLength is 10/);
  });

  it("fails when the request carries no publication", async () => {
    const settings = buildSettings();
    const result = await base64Challenge({ challengeSettings: settings }).getChallenge({
      challengeSettings: settings,
      challengeRequestMessage: {} as unknown as ChallengeRequestMessage,
      challengeIndex: 0,
      community: {} as unknown as GetChallengeArgsInput["community"]
    });
    expect(result).toEqual({ success: false, error: "Could not derive publication from challenge request." });
  });
});

describe("validateChallengeSettings", () => {
  it.each([undefined, "128", "512", "4096"])("accepts maxLength %s", (maxLength) => {
    expect(() =>
      validateChallengeSettings({ challengeSettings: buildSettings(maxLength === undefined ? {} : { maxLength }) })
    ).not.toThrow();
  });

  it.each([
    ["", /must be a whole number/],
    ["abc", /must be a whole number/],
    ["-5", /must be a whole number/],
    ["12.5", /must be a whole number/],
    ["127", /the minimum is 128/]
  ])("rejects maxLength %j", (maxLength, message) => {
    expect(() => validateChallengeSettings({ challengeSettings: buildSettings({ maxLength }) })).toThrow(message);
  });
});
