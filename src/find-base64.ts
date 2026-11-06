// Imports nothing, so a publishing client can run the same check before signing and tell the author why a
// post would be rejected, instead of finding out from the community. Keep it identical to the README.

export const DEFAULT_MAX_BASE64_LENGTH = 512;

// The lowest maxLength an owner can set. Every publication carries base64 its author did not choose: an
// ed25519 signature is 88 characters and a public key 44, so a limit near those would reject everything.
export const MIN_MAX_BASE64_LENGTH = 128;

// A data: URI payload shorter than this cannot hold a meaningful image (a 1x1 GIF is 56 characters), and
// leaving short ones alone keeps posts about data URIs, like `data:image/png;base64,...`, postable.
export const MIN_DATA_URI_PAYLOAD_LENGTH = 64;

export type Base64Finding = {
  kind: "dataUri" | "base64Run";
  // Where the data: URI or the run starts in the scanned text.
  index: number;
  // Payload or run length in characters, whitespace not counted.
  length: number;
};

// RFC 2397: data:[<mediatype>][;param]*[;base64],<data>. The \b keeps "metadata:" from matching, and
// requiring the comma keeps prose like "the data: 5 users" from matching.
const DATA_URI_PATTERN = /\bdata:(?:[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)?((?:;[a-z0-9!#$&^_.+=-]*)*),/gi;

// Browsers strip all whitespace inside a base64 data: URI and percent-decode it first, so a payload can be
// split by spaces anywhere, or have its + and / escaped, and still render. Spaces are not counted, but words
// after a short payload are: prose spelling out "data:...;base64," followed by 64 letters is the cost.
const BASE64_DATA_URI_PAYLOAD_PATTERN = /[A-Za-z0-9+/=%\s]*/y;

// A payload that is not base64 (percent-encoded SVG, usually) ends where a URL would end in markdown or HTML.
const PLAIN_DATA_URI_PAYLOAD_PATTERN = /[^\s"'<>()`]*/y;

// Standard base64 only. base64url swaps + and / for - and _, which would make every long hyphenated URL
// slug a run, and a data: URI cannot carry base64url anyway. Segments of 32 or more characters separated by
// whitespace are one run, which is how MIME and PEM wrap base64 at 76 and 64 characters a line.
const BASE64_RUN_PATTERN = /(?:[A-Za-z0-9+/]{32,}={0,2}\s+)*[A-Za-z0-9+/]{32,}={0,2}/g;

// Hex is a subset of the base64 alphabet, and long hex is normal on a crypto board: hashes, signatures,
// transaction calldata. Real base64 of any length is all but certain to contain a letter past f.
const HEX_SEGMENT_PATTERN = /^(?:0x)?[0-9a-f]+$/i;

const countNonWhitespace = (value: string) => value.replace(/\s/g, "").length;

const findDataUri = (text: string): Base64Finding | undefined => {
  for (const match of text.matchAll(DATA_URI_PATTERN)) {
    const parameters = match[1] ?? "";
    const payloadPattern = /;base64$/i.test(parameters) ? BASE64_DATA_URI_PAYLOAD_PATTERN : PLAIN_DATA_URI_PAYLOAD_PATTERN;
    payloadPattern.lastIndex = match.index + match[0].length;
    const payload = payloadPattern.exec(text)?.[0] ?? "";
    const length = countNonWhitespace(payload);
    if (length >= MIN_DATA_URI_PAYLOAD_LENGTH) {
      return { kind: "dataUri", index: match.index, length };
    }
  }
  return undefined;
};

const findBase64Run = (text: string, maxLength: number): Base64Finding | undefined => {
  for (const match of text.matchAll(BASE64_RUN_PATTERN)) {
    const length = countNonWhitespace(match[0]);
    if (length < maxLength) continue;
    if (match[0].split(/\s+/).every((segment) => HEX_SEGMENT_PATTERN.test(segment))) continue;
    return { kind: "base64Run", index: match.index, length };
  }
  return undefined;
};

/**
 * The first data: URI with a payload of at least MIN_DATA_URI_PAYLOAD_LENGTH characters, or failing that the
 * first run of base64 at least maxLength characters long, in text. Undefined when there is neither.
 */
export const findBase64 = ({
  text,
  maxLength = DEFAULT_MAX_BASE64_LENGTH
}: {
  text: string;
  maxLength?: number;
}): Base64Finding | undefined => findDataUri(text) ?? findBase64Run(text, maxLength);
