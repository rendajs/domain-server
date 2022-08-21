import { serve } from "https://deno.land/std@0.152.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.152.0/http/file_server.ts";
import { resolve } from "https://deno.land/std@0.152.0/path/mod.ts";

const port = parseInt(Deno.env.get("PORT") || "0", 10);
const wwwDir = Deno.env.get("WWW_DIR") || "./www";
const studioDir = resolve(wwwDir, "studio");

serve((req) => {
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
		}
		if (!dir) {
			throw new Error("Invalid hostname");
		}
		const fsRoot = resolve(studioDir, dir);
		return serveDir(req, {
			fsRoot,
		});
	}
	return new Response(url.hostname);
}, {
	port,
});
