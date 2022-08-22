import { bytesToHex, digestString } from "./src/digestString.ts";

/**
 * @fileoverview Use this to generate deploy tokens.
 * Usage: `deno run generateDeployToken.ts`.
 * The resulting token is what you use for authentication using the `DEPLOY_TOKEN` header.
 * The hash is what you place in a file that the `XXX_DEPLOY_TOKEN_PATH` environment variable points to.
 */

const values = new Uint8Array(32);
crypto.getRandomValues(values);

const token = bytesToHex(values);
const hash = await digestString(token);
console.log(`TOKEN: ${token}
HASH: ${hash}`);
