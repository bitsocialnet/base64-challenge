import type {
  ChallengeFileInput,
  ChallengeInput,
  ChallengeResultInput,
  CommunityChallengeSetting,
  GetChallengeArgsInput
} from "./types.js";
import {
  DEFAULT_MAX_BASE64_LENGTH,
  MIN_DATA_URI_PAYLOAD_LENGTH,
  MIN_MAX_BASE64_LENGTH,
  findBase64,
  type Base64Finding
} from "./find-base64.js";

export const MAX_LENGTH_OPTION = "maxLength";

const DEFAULT_ERROR =
  "Embedded base64 data and data: URIs aren't allowed. Upload the file to a media host and post the link instead.";

const description =
  "Rejects publications that embed base64 data, such as data: URI images, in any text field. Media has to be linked instead.";

const type: ChallengeInput["type"] = "text/plain";

const optionInputs: NonNullable<ChallengeFileInput["optionInputs"]> = [
  {
    option: MAX_LENGTH_OPTION,
    label: "Max Base64 Length",
    default: String(DEFAULT_MAX_BASE64_LENGTH),
    description: `Longest run of base64 characters allowed anywhere in a publication, line breaks not counted. Hex is exempt. A data: URI is rejected from a ${MIN_DATA_URI_PAYLOAD_LENGTH} character payload whatever this is set to. At least ${MIN_MAX_BASE64_LENGTH}, because every publication carries an 88 character base64 signature.`,
    placeholder: String(DEFAULT_MAX_BASE64_LENGTH)
  },
  {
    option: "error",
    label: "Error",
    default: DEFAULT_ERROR,
    description: "The error to display to the author when a publication contains base64 data.",
    placeholder: DEFAULT_ERROR
  }
];

const publicationFieldNames = ["comment", "vote", "commentEdit", "commentModeration", "communityEdit"] as const;

// Every string in the publication at any depth, object keys included, rather than a list of fields. pkc-js
// keeps adding free text (gallery alt text, flair text, the comment embedded in a crosspost), and any field
// left off a list is somewhere to put an image.
const findBase64InValue = (value: unknown, maxLength: number): Base64Finding | undefined => {
  if (typeof value === "string") return findBase64({ text: value, maxLength });
  if (typeof value !== "object" || value === null || ArrayBuffer.isView(value)) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const finding = findBase64InValue(item, maxLength);
      if (finding) return finding;
    }
    return undefined;
  }

  for (const [key, item] of Object.entries(value)) {
    const finding = findBase64({ text: key, maxLength }) ?? findBase64InValue(item, maxLength);
    if (finding) return finding;
  }
  return undefined;
};

const parseMaxLength = (maxLength: string | undefined): number => {
  if (maxLength === undefined) return DEFAULT_MAX_BASE64_LENGTH;

  // An empty string satisfies core's checks but is not a number, so it is an error rather than the default.
  if (!/^\d+$/.test(maxLength)) {
    throw new Error(`${MAX_LENGTH_OPTION} must be a whole number of characters, got "${maxLength}"`);
  }
  const parsed = Number(maxLength);
  if (parsed < MIN_MAX_BASE64_LENGTH) {
    throw new Error(
      `${MAX_LENGTH_OPTION} is ${parsed}, the minimum is ${MIN_MAX_BASE64_LENGTH}: every publication carries an 88 character base64 signature, so a lower limit rejects every author`
    );
  }
  return parsed;
};

const getChallenge = async ({
  challengeSettings,
  challengeRequestMessage
}: GetChallengeArgsInput): Promise<ChallengeResultInput> => {
  const publications = publicationFieldNames
    .map((fieldName) => challengeRequestMessage[fieldName])
    .filter((publication) => publication !== undefined);
  if (!publications.length) {
    return { success: false, error: "Could not derive publication from challenge request." };
  }

  // validateChallengeSettings rejects a bad maxLength at edit time, so this only catches a config saved before
  // that check existed. Failing every publication is louder than silently falling back to the default.
  let maxLength: number;
  try {
    maxLength = parseMaxLength(challengeSettings?.options?.[MAX_LENGTH_OPTION]);
  } catch (e) {
    return { success: false, error: `Invalid base64 challenge settings: ${(e as Error).message}` };
  }

  if (findBase64InValue(publications, maxLength)) {
    return { success: false, error: challengeSettings?.options?.["error"] || DEFAULT_ERROR };
  }
  return { success: true };
};

// Sync and no network, per docs/protocol/challenge-authoring.md in pkc-js: it runs on every community start.
const validateChallengeSettings = ({ challengeSettings }: { challengeSettings: CommunityChallengeSetting }): void => {
  parseMaxLength(challengeSettings.options?.[MAX_LENGTH_OPTION]);
};

function ChallengeFileFactory(_args: { challengeSettings: CommunityChallengeSetting }): ChallengeFileInput {
  // Never throws: the factory runs on load as well as on edit, so a throw here would fail community startup
  // rather than the offending edit.
  return { getChallenge, optionInputs, type, description, validateChallengeSettings };
}

export { description, optionInputs, getChallenge, validateChallengeSettings };
export default ChallengeFileFactory;
