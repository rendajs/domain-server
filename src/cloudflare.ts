function getEnv(key: string) {
	const value = Deno.env.get(key);
	if (!value) {
		console.warn(`No environment variable for ${key} has been set, Cloudflare cache purging is not supported.`);
	}
	return value;
}

const zoneIdentifier = getEnv("CF_ZONE_IDENTIFIER");
const token = getEnv("CF_TOKEN");

export async function purgeUrl(url: string) {
	if (!zoneIdentifier || !token) return;

	const timeoutPromise = (async () => {
		await new Promise<void>((r) => {
			setTimeout(() => {
				r();
			}, 5000);
		});
		throw new Error("Cloudflare timed out while purging cache.");
	})();

	const resultPromise = (async () => {
		const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneIdentifier}/purge_cache`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				files: [url],
			}),
		});
		if (!response.ok) {
			throw new Error(`Non ok status code returned: ${response.status}`);
		}
		const result = await response.json();
		if (!result.success) {
			throw new Error("Cloudflare responded with an error", result.errors);
		}
	})();
	await Promise.race([resultPromise, timeoutPromise]);
}
