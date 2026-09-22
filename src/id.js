import { customAlphabet } from "nanoid";

const alphabet = "0123456789"; // no ambiguous chars
const generate = customAlphabet(alphabet, 3);

/** e.g. PHR-284913 — kept distinct from the main site's PH27-GCE### IDs
 * so the two sources are easy to tell apart in the shared table. */
export function generateRegId() {
  return `PH26-${generate()}`;
}
