import { errors } from "https://deno.land/std@0.152.0/http/http_errors.ts";

const localProxyPort = Deno.env.get("RENDAJS_ORG_PROXY_PORT") || "8000";

export async function serveRendaJsOrg(request: Request, isLocalRequest = true) {
	const url = new URL(request.url);
	url.protocol = "http:";
	url.hostname = "0.0.0.0";
	url.port = localProxyPort;
	let proxyResponse;
	try {
		proxyResponse = await fetch(url.href, {
			headers: request.headers,
			method: request.method,
			body: request.body,
			redirect: "manual",
		});
	} catch {
		let message;
		if (isLocalRequest) {
			message = `Failed to proxy to the local rendajs.org server.
If you are running this in local development, make sure you have checked out and are running the rendajs.org repository:
https://github.com/rendajs/rendajs.org

You can change the local port that is being proxied by setting the RENDAJS_ORG_PROXY_PORT environment variable.`;
		} else {
			message = "Bad Gateway";
		}
		throw new errors.BadGateway(message);
	}
	return proxyResponse;
}
