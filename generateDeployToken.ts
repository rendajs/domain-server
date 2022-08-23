import { bytesToHex, digestString } from "./src/digestString.ts";

/**
 * @fileoverview Use this to generate deploy tokens.
 * Usage: `deno run generateDeployToken.ts`.
 * The resulting token is what you use for authentication using the `DEPLOY_TOKEN` header.
 * The hash is what you place in a file that the `XXX_DEPLOY_TOKEN_PATH` environment variable points to.
 * Alternatively you can provide the token as the first argument, for example:
 * `deno run generateDeployToken.ts my_very_secure_password`
 */

let token = Deno.args[0] || "";

if (!token) {
	const values = new Uint8Array(32);
	crypto.getRandomValues(values);
	token = bytesToHex(values);
}

const hash = await digestString(token);
console.log(`TOKEN: ${token}
HASH: ${hash}`);
