#!/usr/bin/env -S deno run --watch --allow-env --allow-read --allow-write --allow-net

import { Handler, serve, serveTls } from "https://deno.land/std@0.152.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.152.0/http/file_server.ts";
import { resolve } from "https://deno.land/std@0.152.0/path/mod.ts";
import { deployHandler } from "./src/deployHandler.ts";

const port = parseInt(Deno.env.get("PORT") || "0", 10);
const wwwDir = Deno.env.get("WWW_DIR") || "./www";
export const studioDir = resolve(wwwDir, "studio");
const certFile = Deno.env.get("TLS_CERT_FILE");
const keyFile = Deno.env.get("TLS_KEY_FILE");

const stableDeployTokenPath = Deno.env.get("STABLE_DEPLOY_HASH_PATH") || "./stableDeployHash.txt";
const canaryDeployTokenPath = Deno.env.get("CANARY_DEPLOY_HASH_PATH") || "./canaryDeployHash.txt";

export let stableDeployToken: string | null = null;
export let canaryDeployToken: string | null = null;
try {
	stableDeployToken = await Deno.readTextFile(stableDeployTokenPath);
} catch {
	console.warn(`Failed to read stable deploy hash at "${stableDeployTokenPath}", deploying to stable is not possible.`);
}
try {
	canaryDeployToken = await Deno.readTextFile(canaryDeployTokenPath);
} catch {
	console.warn(`Failed to read canary deploy hash at "${canaryDeployTokenPath}", deploying to canary is not possible.`);
}

const handler: Handler = async (req) => {
	let url = new URL(req.url);

	// For local development, we'll modify the request so that you can access
	// certain paths without having to spoof your hostname.
	if (url.hostname == "localhost") {
		let path = url.pathname;
		if (path.startsWith("/")) {
			path = path.substring(1);
		}
		try {
			url = new URL(path);
		} catch {
			return new Response(`"${path}" is not a valid URL`, {
				status: 400,
			});
		}
		req = new Request(url.href, {
			headers: req.headers,
			method: req.method,
			body: req.body,
		});
	}
	if (url.hostname == "renda.studio" || url.hostname.endsWith(".renda.studio")) {
		let subdomain = "";
		if (url.hostname.endsWith(".renda.studio")) {
			subdomain = url.hostname.substring(0, url.hostname.length - ".renda.studio".length);
		}
		let dir = null;
		if (subdomain == "") {
			dir = "stable";
		} else if (subdomain == "canary") {
			dir = "canary";
		} else if (subdomain == "deploy") {
			return await deployHandler(req);
		}
		if (!dir) {
			throw new Error("Invalid hostname");
		}
		const fsRoot = resolve(studioDir, dir);
		return serveDir(req, {
			fsRoot,
			showDirListing: true,
		});
	}
	return new Response(url.hostname);
};

if (certFile && keyFile) {
	serveTls(handler, {
		certFile,
		keyFile,
		port,
	});
} else {
	serve(handler, { port });
}
