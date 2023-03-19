import { serveDir } from "https://deno.land/std@0.152.0/http/file_server.ts";

export async function serveStudio(req: Request, fsRoot: string) {
	const url = new URL(req.url);
	if (url.pathname == "/internalDiscovery") {
		req = new Request(req.url + ".html", req);
	}
	return await serveDir(req, {
		fsRoot,
		showDirListing: true,
	});
}
