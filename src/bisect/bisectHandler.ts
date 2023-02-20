import * as path from "https://deno.land/std@0.152.0/path/mod.ts";
import { Octokit } from "npm:@octokit/rest@19.0.7";
import { studioDir } from "../../main.ts";
import { serveDir } from "https://deno.land/std@0.152.0/http/file_server.ts";

const octokit = new Octokit({
	auth: Deno.env.get("GITHUB_ACCESS_TOKEN"),
});

export interface CommitData {
	sha: string;
	message: string;
}

const MAX_COMMIT_REQUESTS = 50;
let cachedCommitData: CommitData[] = [];
try {
	cachedCommitData = JSON.parse(localStorage.cachedCommitData);
} catch {
	// Not cached or corrupted data.
}
async function listCommits() {
	const lastCachedSha = cachedCommitData.at(0)?.sha;
	let count = 0;
	const result = await octokit.paginate("GET /repos/{owner}/{repo}/commits", {
		owner: "rendajs",
		repo: "Renda",
	}, (response, done) => {
		const mapped = response.data.map((commit) => {
			commit.commit.committer?.date;
			const commitData: CommitData = {
				sha: commit.sha,
				message: commit.commit.message,
			};
			return commitData;
		});
		count++;
		if (mapped.find((commit) => commit.sha == lastCachedSha) || count >= MAX_COMMIT_REQUESTS) done();
		return mapped;
	});
	for (const commit of result) {
		if (commit.sha == lastCachedSha) break;
		cachedCommitData.push(commit);
	}
	localStorage.cachedCommitData = JSON.stringify(cachedCommitData);

	const deployedCommitDirs: string[] = [];
	const commitsDir = path.resolve(studioDir, "commits");
	for await (const entry of Deno.readDir(commitsDir)) {
		if (entry.isDirectory) deployedCommitDirs.push(entry.name);
	}

	return cachedCommitData.filter((commit) => deployedCommitDirs.includes(commit.sha));
}

export async function bisectHandler(req: Request) {
	const url = new URL(req.url);
	if (url.pathname == "/commits") {
		const commitData = await listCommits();
		return Response.json(commitData);
	} else {
		const fsRoot = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), "client");
		return serveDir(req, {
			fsRoot,
			showDirListing: true,
		});
	}
}
