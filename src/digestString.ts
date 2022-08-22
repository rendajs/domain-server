export async function digestString(str: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(str);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return bytesToHex(new Uint8Array(hash));
}

export function bytesToHex(bytes: Uint8Array) {
	const hashArray = Array.from(new Uint8Array(bytes));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	return hashHex;
}
