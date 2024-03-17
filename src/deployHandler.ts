import { canaryDeployToken, prDeployToken, productionDeployToken, stagingDeployToken, studioDir } from "../main.ts";
import { digestString } from "./digestString.ts";
import { Untar } from "https://deno.land/std@0.152.0/archive/tar.ts";
import { readerFromStreamReader } from "https://deno.land/std@0.151.0/streams/conversion.ts";
import { copy, ensureDir, ensureFile } from "https://deno.land/std@0.151.0/fs/mod.ts";
import { copy as copyStream } from "https://deno.land/std@0.151.0/streams/conversion.ts";
import { resolve } from "https://deno.land/std@0.152.0/path/mod.ts";
import { errors, isHttpError } from "https://deno.land/std@0.152.0/http/http_errors.ts";
import { purgeUrl } from "./cloudflare.ts";

export async function deployHandler(req: Request) {
	if (req.method != "POST") {
		return new Response("Deploy needs to be a POST request.", {
			status: 404,
		});
	}
	const url = new URL(req.url);
	const path = url.pathname;
	if (path == "/production") {
		await validateDeployToken(req, productionDeployToken);
		await copyDeployDir(resolve(studioDir, "staging"), "production");
		await tryPurgeDomain("renda.studio");
		return new Response("ok");
	} else if (path == "/staging") {
		await validateDeployToken(req, stagingDeployToken);

		const deployDirs = ["staging"];
		let versionString = url.searchParams.get("version");
		if (versionString) {
			if (versionString.startsWith("v")) versionString = versionString.slice(1);
			versionString = versionString.replaceAll(".", "-");
			deployDirs.push("versions/" + versionString);
		}
		await deployArchive(req, deployDirs);

		await tryPurgeDomain("staging.renda.studio");
		return new Response("ok");
	} else if (path == "/canary") {
		await validateDeployToken(req, canaryDeployToken);

		const deployDirs = ["canary"];
		const commitHash = url.searchParams.get("commit");
		if (commitHash) {
			deployDirs.push("commits/" + commitHash);
		}
		await deployArchive(req, deployDirs);

		await tryPurgeDomain("canary.renda.studio");
		return new Response("ok");
	} else if (path == "/pr") {
		await validateDeployToken(req, prDeployToken);

		const prId = parseInt(url.searchParams.get("id") || "", 10);
		if (isNaN(prId) || prId <= 0) {
			throw new errors.BadRequest("Invalid PR id.");
		}
		await deployArchive(req, ["pr/" + prId]);

		await tryPurgeDomain(`pr-${prId}.renda.studio`);
		return new Response("ok");
	} else {
		throw new errors.NotFound("Release channel not found");
	}
}

/**
 * Asserts that the request contains a valid deploy token and throws a http error if not.
 */
async function validateDeployToken(request: Request, expectedToken: string | null) {
	if (!expectedToken || !expectedToken.trim()) {
		throw new errors.InternalServerError("No deploy token set on the server.");
	}
	let token;
	const tokenHeader = request.headers.get("Authorization");
	if (tokenHeader) {
		const split = tokenHeader.split(" ");
		if (split[0] != "DeployToken") {
			throw new errors.BadRequest("Invalid authorization type");
		}
		token = split[1];
	}
	if (!token) {
		throw new errors.BadRequest("Missing deploy token");
	}
	const hash = await digestString(token);
	if (hash != expectedToken.trim()) {
		throw new errors.BadRequest("Invalid token");
	}
}

/**
 * Decompresses the body and writes the contents to a temporary directory.
 * Once this is done, the contents are copied to `deployDirs`.
 * Throws a http error when something goes wrong.
 */
async function deployArchive(request: Request, deployDirs: string[]) {
	const tmpDir = await Deno.makeTempDir({
		prefix: "deploying-",
	});

	if (!request.body) {
		return new Response("Request body is empty", {
			status: 400,
		});
	}

	try {
		try {
			const decompressionStream = new DecompressionStream("gzip");
			const stream = request.body.pipeThrough(decompressionStream).getReader();
			const untar = new Untar(readerFromStreamReader(stream));
			for await (const entry of untar) {
				const fullPath = resolve(tmpDir, entry.fileName);
				if (entry.type === "directory") {
					await ensureDir(fullPath);
					continue;
				}

				await ensureFile(fullPath);
				const file = await Deno.open(fullPath, { write: true });
				await copyStream(entry, file);
			}
		} catch (e) {
			if (e instanceof TypeError && e.message == "invalid gzip header") {
				throw new errors.BadRequest("The uploaded data is not gzipped.");
			}
			throw new errors.InternalServerError("Failed to decompress archive.");
		}

		for (const deployDir of deployDirs) {
			await copyDeployDir(tmpDir, deployDir);
		}
	} catch (e) {
		if (e && isHttpError(e)) {
			// Will be handled in main.ts
			throw e;
		}
		console.error(e);
		throw new errors.InternalServerError("Failed to deploy, check the server logs for details.");
	} finally {
		try {
			await Deno.remove(tmpDir, { recursive: true });
		} catch {
			// Already removed.
		}
	}
}

async function copyDeployDir(sourceDir: string, deployDir: string) {
	const resolvedDestination = resolve(studioDir, deployDir);
	await ensureDir(resolvedDestination);
	await copy(sourceDir, resolvedDestination, {
		overwrite: true,
	});
}

/**
 * Attempts to purge the service worker file from Cloudflare.
 * Throws a http error when this fails.
 */
async function tryPurgeDomain(domain: string) {
	try {
		await purgeUrl(`https://${domain}/sw.js`);
	} catch (e) {
		console.error(e);
		throw new errors.InternalServerError("Failed to purge Cloudflare cache. check the server logs for details.");
	}
}
