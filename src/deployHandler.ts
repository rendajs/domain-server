import { canaryDeployToken, stableDeployToken, studioDir } from "../main.ts";
import { digestString } from "./digestString.ts";
import { Untar } from "https://deno.land/std@0.152.0/archive/tar.ts";
import { readerFromStreamReader } from "https://deno.land/std@0.151.0/streams/conversion.ts";
import { ensureDir, ensureFile } from "https://deno.land/std@0.151.0/fs/mod.ts";
import { copy } from "https://deno.land/std@0.151.0/streams/conversion.ts";
import { resolve } from "https://deno.land/std@0.152.0/path/mod.ts";
import { errors, isHttpError } from "https://deno.land/std@0.152.0/http/http_errors.ts";

export async function deployHandler(req: Request) {
	if (req.method != "POST") {
		return new Response("Deploy needs to be a POST request.", {
			status: 404,
		});
	}
	const url = new URL(req.url);
	const path = url.pathname;
	let expectedToken = null;
	let deployDirName = null;
	if (path == "/stable") {
		expectedToken = stableDeployToken;
		deployDirName = "stable";
	} else if (path == "/canary") {
		expectedToken = canaryDeployToken;
		deployDirName = "canary";
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
	const token = req.headers.get("DEPLOY_TOKEN");
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
				await copy(entry, file);
			}
		} catch (e) {
			if (e instanceof TypeError && e.message == "invalid gzip header") {
				throw new errors.BadRequest("The uploaded data is not gzipped.")
			}
		}

		const deployDir = resolve(studioDir, deployDirName);
		await ensureDir(deployDir);
		// Remove deployDir so we don't get errors when overwriting it with tmpDir
		await Deno.remove(deployDir, { recursive: true });
		await Deno.rename(tmpDir, deployDir);
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
			return new Response(catchedError.message, {status: catchedError.status})
		}
		return new Response("Failed to deploy, check the server logs for details", {
			status: 500,
		});
	}
}
