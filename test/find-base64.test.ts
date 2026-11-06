import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_BASE64_LENGTH,
  MIN_DATA_URI_PAYLOAD_LENGTH,
  MIN_MAX_BASE64_LENGTH,
  findBase64
} from "../src/find-base64.js";

// Real base64 shape: mixed case, digits, + and /.
const BASE64_UNIT = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ+/8=";
const base64OfLength = (length: number) => BASE64_UNIT.replace("=", "").repeat(Math.ceil(length / 47)).slice(0, length);
const wrap = (value: string, lineLength: number) => value.match(new RegExp(`.{1,${lineLength}}`, "g"))?.join("\n") ?? value;

describe("constants", () => {
  it("pins the defaults the README documents", () => {
    expect(DEFAULT_MAX_BASE64_LENGTH).toBe(512);
    expect(MIN_MAX_BASE64_LENGTH).toBe(128);
    expect(MIN_DATA_URI_PAYLOAD_LENGTH).toBe(64);
  });
});

describe("findBase64 on ordinary text", () => {
  it.each([
    ["prose", "Check out this thread, it has 5 users and no data. ".repeat(40)],
    ["a long URL slug", `https://example.com/news/${"a-very-long-article-slug-about-something-".repeat(20)}`],
    ["an ed25519 signature", base64OfLength(88)],
    ["a CID", "QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR"],
    ["a sha256 hash", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["long hex calldata", `0x${"a9059cbb000000000000000000000000".repeat(64)}`],
    ["line-wrapped hex", wrap("deadbeef".repeat(200), 64)],
    ["a word ending in data:", `metadata:image/png;base64,${base64OfLength(100)}`],
    ["prose with data:", "the data: image/png;base64, is how it starts"],
    ["a short data URI example", "use data:image/png;base64,... for inline images"],
    ["a 1x1 GIF data URI", "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"],
    ["a short run of base64", base64OfLength(DEFAULT_MAX_BASE64_LENGTH - 1)]
  ])("passes %s", (_name, text) => {
    expect(findBase64({ text })).toBeUndefined();
  });

  it("does not join short words into a run", () => {
    expect(findBase64({ text: "abcdefghijklmnopqrstuvwxyzABCDE ".repeat(100) })).toBeUndefined();
  });
});

describe("findBase64 on data: URIs", () => {
  it("finds a base64 image data URI", () => {
    const text = `look ![](data:image/png;base64,${base64OfLength(MIN_DATA_URI_PAYLOAD_LENGTH)})`;
    expect(findBase64({ text })).toEqual({ kind: "dataUri", index: 9, length: MIN_DATA_URI_PAYLOAD_LENGTH });
  });

  it("passes a payload one character short of the minimum", () => {
    expect(findBase64({ text: `data:image/png;base64,${base64OfLength(MIN_DATA_URI_PAYLOAD_LENGTH - 1)}` })).toBeUndefined();
  });

  it("ignores case, as browsers do", () => {
    expect(findBase64({ text: `DATA:IMAGE/JPEG;BASE64,${base64OfLength(100)}` })?.kind).toBe("dataUri");
  });

  it("counts a line-wrapped payload with a leading space, which browsers still decode", () => {
    const payload = base64OfLength(300);
    const finding = findBase64({ text: `<img src="data:image/png;base64, ${wrap(payload, 76)}">` });
    expect(finding).toEqual({ kind: "dataUri", index: 10, length: 300 });
  });

  it("counts a payload split by spaces into short segments, as in a markdown <...> destination", () => {
    const payload = base64OfLength(300);
    const finding = findBase64({ text: `![](<data:image/png;base64,${wrap(payload, 20).replace(/\n/g, " ")}>)` });
    expect(finding).toEqual({ kind: "dataUri", index: 5, length: 300 });
  });

  it("counts a percent-encoded base64 payload", () => {
    const payload = base64OfLength(100).replace(/\+/g, "%2B").replace(/\//g, "%2F");
    expect(findBase64({ text: `data:image/png;base64,${payload}` })?.kind).toBe("dataUri");
  });

  it("finds a non-base64 data URI, such as percent-encoded SVG", () => {
    const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle r="40" fill="red"/></svg>');
    expect(findBase64({ text: `![](data:image/svg+xml,${svg})` })?.kind).toBe("dataUri");
  });

  it("finds a data URI with no media type", () => {
    expect(findBase64({ text: `data:;base64,${base64OfLength(100)}` })?.kind).toBe("dataUri");
  });

  it("finds a data URI below maxLength, since data: URIs have their own minimum", () => {
    expect(findBase64({ text: `data:image/png;base64,${base64OfLength(200)}`, maxLength: 4096 })?.kind).toBe("dataUri");
  });
});

describe("findBase64 on raw base64 runs", () => {
  it("finds a run of maxLength characters", () => {
    const text = `pasted: ${base64OfLength(DEFAULT_MAX_BASE64_LENGTH)} end`;
    expect(findBase64({ text })).toEqual({ kind: "base64Run", index: 8, length: DEFAULT_MAX_BASE64_LENGTH });
  });

  it("counts a line-wrapped run as one, without the line breaks", () => {
    const finding = findBase64({ text: wrap(base64OfLength(76 * 14), 76) });
    expect(finding).toEqual({ kind: "base64Run", index: 0, length: 76 * 14 });
  });

  it("finds a run inside other punctuation", () => {
    expect(findBase64({ text: `\`${base64OfLength(600)}\`` })?.kind).toBe("base64Run");
  });

  it("respects a custom maxLength", () => {
    const text = base64OfLength(200);
    expect(findBase64({ text })).toBeUndefined();
    expect(findBase64({ text, maxLength: 200 })?.kind).toBe("base64Run");
  });

  // Documented limitation: base64url shares its alphabet with URL slugs, and a data: URI cannot carry it.
  it("does not treat base64url as a run", () => {
    expect(findBase64({ text: base64OfLength(1000).replace(/\+/g, "-").replace(/\//g, "_") })).toBeUndefined();
  });
});
