# @bitsocial/base64-challenge

A pkc-js challenge that rejects publications embedding base64 data, such as `data:` URI images, in any text field.

## Why

pkc-js limits `link` and gallery URLs to 2000 characters, and the community only accepts `https:` links there, so a `data:` URI cannot get in through them. `content` and `title` have no length limit of their own, only the 40 KB limit on the whole publication. That is room for a roughly 29 KB image as base64: small, but recognizable. A community that accepts it signs it, stores it and serves it over IPFS, whether or not any client renders it.

AI moderation cannot judge it either. A text model sees a wall of characters, not the image, and pays tokens for every one of them. This challenge is deterministic, cheap, and runs no model.

## What it rejects

A publication is rejected when any string in it, at any depth and including object keys, contains either:

1. **A `data:` URI with a payload of 64 characters or more.** This applies to any media type, base64 or not, so percent-encoded SVG counts too. Matching ignores case. Whitespace anywhere in a base64 payload is skipped, as browsers skip it, and percent-escapes count. The cost is that a sentence spelling out `data:image/png;base64,` followed by 64 or more letters and digits, with no punctuation, is rejected too. Payloads under 64 characters pass: no meaningful image fits (a 1x1 GIF is 56 characters), and posts about data URIs, like `data:image/png;base64,...`, stay postable.
2. **A run of base64 of `maxLength` characters or more** (default 512). A run is standard base64 (`A-Z a-z 0-9 + /`, with optional `=` padding). Whitespace between segments of 32 or more characters continues a run, so base64 wrapped at 64 or 76 characters a line (PEM, MIME) counts as one. Whitespace is not counted toward the length. A run made entirely of hex (optionally `0x`-prefixed) passes, because hashes, signatures and transaction calldata are ordinary on crypto boards.

Every string means every string: content, title, link, flair text, gallery alt text, display names, the comment embedded in a crosspost, edit and moderation reasons, community edits. A list of fields would need updating whenever pkc-js adds free text, and any field missing from it would be somewhere to put an image.

It checks all five publication types: `comment`, `vote`, `commentEdit`, `commentModeration` and `communityEdit`. Use the challenge's `exclude` settings to exempt moderators.

Every publication carries base64 its author did not choose, an 88-character signature and a 44-character public key. These stay well under the minimum `maxLength` of 128.

## What it does not catch

- **base64url.** It swaps `+` and `/` for `-` and `_`, the same characters as a long hyphenated URL slug, so counting it would reject ordinary links. A `data:` URI cannot carry base64url, so nothing renders it as an image.
- **Other encodings.** Hex, base32, base85 and anything custom. A determined uploader can always encode data somehow. The 40 KB publication limit is what bounds that.
- **A `data:` URI with an unencoded payload** that has whitespace, a quote, a parenthesis or an angle bracket in its first 64 characters, such as raw `<svg xmlns=...>`. This only matters to a client that renders raw HTML.
- **Raw base64 split into segments shorter than 32 characters.** Ordinary text is short runs of letters and digits separated by spaces, so short segments cannot be joined into a run without rejecting prose. Inside a `data:` URI this does not apply, since the payload rule skips all whitespace.
- A line-wrapped run's final line is not counted when it is shorter than 32 characters, so a run can be reported up to 31 characters short.

Clients should not render `data:` URIs from publications either. This challenge keeps them off the community. It does not make rendering them safe.

## Install

### With bitsocial-cli

```bash
bitsocial challenge install @bitsocial/base64-challenge
```

```bash
bitsocial community edit your-community.bso \
  '--settings.challenges[0].name' @bitsocial/base64-challenge
```

### With pkc-js over RPC

Install the challenge on the RPC server, then set it on your community by name. Nothing has to be installed on the client side:

```bash
bitsocial challenge install @bitsocial/base64-challenge
```

### With pkc-js (TypeScript)

Running your own node locally, without RPC:

```bash
npm install @bitsocial/base64-challenge
```

```ts
import PKC from "@pkcprotocol/pkc-js";
import { base64Challenge } from "@bitsocial/base64-challenge";

PKC.challenges["@bitsocial/base64-challenge"] = base64Challenge;
```

## Configuration

```json
{
  "name": "@bitsocial/base64-challenge",
  "options": {
    "maxLength": "512",
    "error": "Embedded base64 data and data: URIs aren't allowed. Upload the file to a media host and post the link instead."
  }
}
```

### Options

| Option | Default | Description |
|---|---|---|
| `maxLength` | `512` | Longest run of base64 allowed, in characters, whitespace not counted. A whole number of at least 128. It does not affect `data:` URIs, which are rejected from a 64-character payload whatever it is set to. |
| `error` | `Embedded base64 data and data: URIs aren't allowed. Upload the file to a media host and post the link instead.` | The error shown to the author. |

Neither option needs to be in `publicOptions`. Publishing them is the owner's call.

### Validation

`validateChallengeSettings` rejects a `maxLength` that is not a whole number, including an empty string, or that is below 128. A lower limit would reject every author, since every publication carries an 88-character signature.

A `maxLength` saved before this check existed makes `getChallenge` fail every publication with `Invalid base64 challenge settings: ...` rather than silently fall back to the default.

## For UI client developers

`findBase64` imports nothing, so a client can run the community's check before signing and tell the author what is wrong instead of waiting for a rejection:

```ts
import { findBase64 } from "@bitsocial/base64-challenge";

const finding = findBase64({ text: content, maxLength: 512 });
// undefined, or { kind: "dataUri" | "base64Run", index, length }
```

Use `community.challenges[i].publicOptions.maxLength` if the owner published it, and the default otherwise.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

`npm install` needs npm 11. npm 10's arborist crashes on this package's peer dependency set with `Cannot read properties of null (reading 'edgesOut')`.

## License

GPL-3.0-or-later
