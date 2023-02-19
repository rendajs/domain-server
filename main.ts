#!/usr/bin/env -S deno run --watch --allow-env --allow-read --allow-write --allow-net

import { Handler, serve, serveTls } from "https://deno.land/std@0.152.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.152.0/http/file_server.ts";
import { resolve } from "https://deno.land/std@0.152.0/path/mod.ts";
import { deployHandler } from "./src/deployHandler.ts";
import { errors, isHttpError } from "https://deno.land/std@0.152.0/http/http_errors.ts";

const port = parseInt(Deno.env.get("PORT") || "0", 10);
const wwwDir = Deno.env.get("WWW_DIR") || "./www";
export const studioDir = resolve(wwwDir, "studio");
const certFile = Deno.env.get("TLS_CERT_FILE");
const keyFile = Deno.env.get("TLS_KEY_FILE");

const stableDeployTokenPath = Deno.env.get("STABLE_DEPLOY_HASH_PATH") || "./stable-deploy-hash";
const canaryDeployTokenPath = Deno.env.get("CANARY_DEPLOY_HASH_PATH") || "./canary-deploy-hash";
const prDeployTokenPath = Deno.env.get("PR_DEPLOY_HASH_PATH") || "./pr-deploy-hash";

async function tryGetDeployToken(path: string, environment: string) {
	let token: string | null = null;
	try {
		token = await Deno.readTextFile(path);
	} catch {
		console.warn(`Failed to read ${environment} deploy hash at "${path}", deploying to ${environment} is not possible.`);
	}
	return token;
}

export const stableDeployToken = await tryGetDeployToken(stableDeployTokenPath, "stable");
export const canaryDeployToken = await tryGetDeployToken(canaryDeployTokenPath, "canary");
export const prDeployToken = await tryGetDeployToken(prDeployTokenPath, "pr");

const handler: Handler = async (req) => {
	try {
		let url = new URL(req.url);

		// For local development, we'll modify the request so that you can access
		// certain paths without having to spoof your hostname.
		if (url.hostname == "localhost") {
			let path = url.pathname;
			if (path == "/") {
				const stableUrl = new URL(url);
				stableUrl.pathname = "/https://renda.studio/";
				const canaryUrl = new URL(url);
				canaryUrl.pathname = "/https://canary.renda.studio/";
				return new Response(
					`
<!DOCTYPE html>
<html>
	<head></head>
	<body>
		<p>To visit (sub)domains you can place them in the path next to ${url}</p>
		<ul>
			<li><a href="${stableUrl}">${stableUrl}</a></li>
			<li><a href="${canaryUrl}">${canaryUrl}</a></li>
		</ul>
	</body>
</html>
`,
					{
						headers: {
							"Content-Type": "text/html; charset=utf-8",
						},
					},
				);
			}
			if (path.startsWith("/")) {
				path = path.substring(1);
			}
			try {
				url = new URL(path + url.search);
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
			} else if (subdomain.startsWith("pr-")) {
				const prId = parseInt(subdomain.slice(3), 10);
				if (isNaN(prId) || prId <= 0) {
					throw new errors.BadRequest("Invalid PR id");
				}
				dir = "pr/" + prId;
			} else if (subdomain.startsWith("commit-")) {
				const commitHash = subdomain.slice("commit-".length);
				dir = "commits/" + commitHash;
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
	} catch (e) {
		if (isHttpError(e)) {
			return new Response(e.message, { status: e.status });
		}
		throw e;
	}
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
