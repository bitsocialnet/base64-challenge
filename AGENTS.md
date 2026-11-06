# AGENTS Notes

Reference source files for this repository:

`@pkcprotocol/pkc-js/src/challenges.ts`
`@pkcprotocol/pkc-js/docs/protocol/challenge-authoring.md`
`@pkcprotocol/pkc-js/docs/protocol/challenge-settings.md`

Workflow:

- Before every commit, run `npm run typecheck` and `npm test` and make sure both pass.
- Install with npm 11 (`npx npm@11 install`). npm 10 crashes on the peer dependency set with
  `Cannot read properties of null (reading 'edgesOut')`.

Conventions specific to this challenge:

- `README.md` is the spec. Behaviour changes belong there first, including the "What it does not catch" list.
- `src/find-base64.ts` imports nothing. Publishing clients can run it before signing, so it has to work in a
  browser.
- Scan every string in the publication, keys included. Do not switch to a field list: any field missing
  from it is somewhere to put an image.
- `MIN_MAX_BASE64_LENGTH` stays above the 88-character ed25519 signature every publication carries.
- Keep every pattern linear. This runs on every publication a community receives, and a publication can be
  40 KB of attacker-chosen text. The detector handles a full 40 KB adversarial input in single-digit
  milliseconds; keep it there.
- `validateChallengeSettings` is sync and does no network. `ChallengeFileFactory` never throws.
- Test fixtures are typed against pkc-js's challenge-time publication types through the `build*` helpers in
  `test/base64-challenge.test.ts`. Do not cast a publication through `as unknown as`.
