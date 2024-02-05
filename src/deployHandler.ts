import { canaryDeployToken, prDeployToken, stableDeployToken, studioDir } from "../main.ts";
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
	let expectedToken = null;
	let purgeDomain = null;
	let deployDirs: string[] = [];
	if (path == "/stable") {
		expectedToken = stableDeployToken;
		deployDirs = ["stable"];
		purgeDomain = "renda.studio";
	} else if (path == "/canary") {
		expectedToken = canaryDeployToken;
		deployDirs = ["canary"];
		purgeDomain = "canary.renda.studio";
		const commitHash = url.searchParams.get("commit");
		if (commitHash) {
			deployDirs.push("commits/" + commitHash);
		}
	} else if (path == "/pr") {
		expectedToken = prDeployToken;
		const prId = parseInt(url.searchParams.get("id") || "", 10);
		if (isNaN(prId) || prId <= 0) {
			throw new errors.BadRequest("Invalid PR id.");
		}
		deployDirs = ["pr/" + prId];
		purgeDomain = `pr-${prId}.renda.studio`;
	} else {
		return new Response("Release channel not found", {
			status: 404,
		});
	}
	if (!expectedToken || !expectedToken.trim()) {
		return new Response("No deploy token set on the server.", {
			status: 500,
		});
	}
	let token;
	const tokenHeader = req.headers.get("Authorization");
	if (tokenHeader) {
		const split = tokenHeader.split(" ");
		if (split[0] != "DeployToken") {
			return new Response("Invalid authorization type", {
				status: 401,
			});
		}
		token = split[1];
	}
	if (!token) {
		return new Response("Missing deploy token", {
			status: 401,
		});
	}
	const hash = await digestString(token);
	if (hash != expectedToken.trim()) {
		return new Response("Invalid token", {
			status: 401,
		});
	}

	if (!req.body) {
		return new Response("Missing file", {
			status: 400,
		});
	}

	const tmpDir = await Deno.makeTempDir({
		prefix: "deploying-",
	});
	let success = false;
	let catchedError;
	try {
		try {
			const decompressionStream = new DecompressionStream("gzip");
			const stream = req.body.pipeThrough(decompressionStream).getReader();
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
		}

		for (const dir of deployDirs) {
			const deployDir = resolve(studioDir, dir);
			await ensureDir(deployDir);
			await copy(tmpDir, deployDir, {
				overwrite: true,
			});
		}
		if (purgeDomain) {
			await purgeUrl(`https://${purgeDomain}/sw.js`);
		}
		success = true;
	} catch (e) {
		catchedError = e;
	} finally {
		try {
			await Deno.remove(tmpDir, { recursive: true });
		} catch {
			// Already removed.
		}
	}
	if (success) {
		return new Response("ok");
	} else {
		if (catchedError && isHttpError(catchedError)) {
			// Will be handled in main.ts
			throw catchedError;
		}
		return new Response("Failed to deploy, check the server logs for details", {
			status: 500,
		});
	}
}
