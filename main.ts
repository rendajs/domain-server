#!/usr/bin/env -S deno run --watch --allow-env --allow-read --allow-write --allow-net

import { Handler, serve, serveTls } from "https://deno.land/std@0.152.0/http/server.ts";
import { resolve } from "https://deno.land/std@0.152.0/path/mod.ts";
import * as fs from "https://deno.land/std@0.152.0/fs/mod.ts";
import { deployHandler } from "./src/deployHandler.ts";
import { errors, isHttpError } from "https://deno.land/std@0.152.0/http/http_errors.ts";
import { bisectHandler } from "./src/bisect/bisectHandler.ts";
import { serveStudio } from "./src/serveStudio.ts";
import { Application as StudioDiscovery } from "https://raw.githubusercontent.com/rendajs/studio-discovery-server/e303652743ea29ddcbfdec7b7272331351d35f5e/src/main.js";
import { serveRendaJsOrg } from "./src/serveRendaJsOrg.ts";
import { Status } from "https://deno.land/std@0.152.0/http/http_status.ts";

const port = parseInt(Deno.env.get("PORT") || "0", 10);
const tlsPort = parseInt(Deno.env.get("TLS_PORT") || "0", 10);
const wwwDir = Deno.env.get("WWW_DIR") || "./www";
export const studioDir = resolve(wwwDir, "studio");
const stableDir = resolve(studioDir, "stable");
const canaryDir = resolve(studioDir, "canary");
const prDir = resolve(studioDir, "pr");
const commitsDir = resolve(studioDir, "commits");
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

await fs.ensureDir(wwwDir);
await fs.ensureDir(studioDir);
await fs.ensureDir(stableDir);
await fs.ensureDir(canaryDir);
await fs.ensureDir(prDir);
await fs.ensureDir(commitsDir);

const studioDiscovery = new StudioDiscovery();

const handler: Handler = async (req, connInfo) => {
	try {
		let url = new URL(req.url);

		// For local development, we'll modify the request so that you can access
		// certain paths without having to spoof your hostname.
		const isLocalRequest = url.hostname == "localhost";
		if (isLocalRequest) {
			let path = url.pathname;
			if (path == "/") {
				const domainUrls = [
					"renda.studio",
					"canary.renda.studio",
					"bisect.renda.studio",
					"discovery.renda.studio",
					"rendajs.org",
				];
				const fullUrls = domainUrls.map((domainUrl) => {
					const fullUrl = new URL(url);
					fullUrl.pathname = `/https://${domainUrl}/`;
					return fullUrl;
				});
				const listContent = fullUrls.map((url) => `<li><a href="${url}">${url}</a></li>`).join("");
				return new Response(
					`
<!DOCTYPE html>
<html>
	<head></head>
	<body>
		<p>To visit (sub)domains you can place them in the path next to ${url}</p>
		<ul>
			${listContent}
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

			if (subdomain == "deploy") return await deployHandler(req);
			if (subdomain == "bisect") return await bisectHandler(req);
			if (subdomain == "discovery") return studioDiscovery.webSocketManager.handleRequest(req, connInfo);

			let studioDir = null;
			if (subdomain == "") {
				studioDir = stableDir;
			} else if (subdomain == "canary") {
				studioDir = canaryDir;
			} else if (subdomain.startsWith("pr-")) {
				const prId = parseInt(subdomain.slice(3), 10);
				if (isNaN(prId) || prId <= 0) {
					throw new errors.BadRequest("Invalid PR id");
				}
				studioDir = resolve(prDir, String(prId));
			} else if (subdomain.startsWith("commit-")) {
				const commitHash = subdomain.slice("commit-".length);
				studioDir = resolve(commitsDir, commitHash);
			} else {
				throw new Error("Invalid hostname");
			}

			return await serveStudio(req, studioDir);
		} else if (url.hostname == "rendajs.org") {
			return await serveRendaJsOrg(req, isLocalRequest);
		}
		throw new errors.NotFound();
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
		port: tlsPort,
	});

	// Redirect http to https
	serve((req) => {
		const url = new URL(req.url);
		url.protocol = "https";
		return Response.redirect(url.href, Status.MovedPermanently);
	}, {
		port,
	});
} else {
	serve(handler, { port });
}
