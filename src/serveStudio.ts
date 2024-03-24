import { serveDir } from "https://deno.land/std@0.152.0/http/file_server.ts";

export async function serveStudio(req: Request, fsRoot: string) {
	const url = new URL(req.url);
	if (url.pathname == "/internalDiscovery") {
		req = new Request(req.url + ".html", req);
	}
	const response = await serveDir(req, {
		fsRoot,
		showDirListing: true,
	});
	const contentType = response.headers.get("Content-Type");
	if (!contentType?.startsWith("text/html")) {
		const thirtyDays = 60 * 60 * 24 * 30;
		response.headers.set("Cache-Control", `public, max-age=${thirtyDays}, stale-while-revalidate=${thirtyDays}`);
	}
	return response;
}
