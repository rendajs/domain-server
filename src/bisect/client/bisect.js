/**
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new (...args: any) => T} instance
 * @returns {T}
 */
function getAssertedElementById(id, instance) {
	const el = document.getElementById(id);
	if (!(el instanceof instance)) {
		throw new Error(`Element "${id}" not found or it has an invalid type.`);
	}
	return el;
}

const commitsListEl = getAssertedElementById("commitsList", HTMLDataListElement);
const startFormEl = getAssertedElementById("startBisectForm", HTMLFormElement);
const goodInputEl = getAssertedElementById("goodInput", HTMLInputElement);
const badInputEl = getAssertedElementById("badInput", HTMLInputElement);
const bisectingEl = getAssertedElementById("bisecting", HTMLDivElement);
const commitStatusesEl = getAssertedElementById("commitStatuses", HTMLDivElement);
const stepsLeftLabelEl = getAssertedElementById("stepsLeftLabel", HTMLSpanElement);
const rangeEl = getAssertedElementById("range", HTMLDivElement);
const stepsLeftProgressEl = getAssertedElementById("stepsLeftProgress", HTMLProgressElement);
const doneEl = getAssertedElementById("done", HTMLFormElement);
const copyResultsButtonEl = getAssertedElementById("copyResultsButton", HTMLButtonElement);

const commitsResponse = await fetch("./commits");
/** @type {import("../bisectHandler.ts").CommitData[]} */
const commits = await commitsResponse.json();

for (const commit of commits) {
	const optionEl = document.createElement("option");
	optionEl.value = commit.sha;
	optionEl.textContent = commit.message;
	commitsListEl.appendChild(optionEl);
}

startFormEl.addEventListener("submit", (e) => {
	e.preventDefault();

	if (commits.length < 2) {
		throw new Error("Unable to bisect, at least two commits are needed.");
	}

	/**
	 * @param {HTMLInputElement} inputEl
	 */
	function findIndex(inputEl) {
		return commits.findIndex((commit) => commit.sha == inputEl.value);
	}

	if (!goodInputEl.value) {
		goodIndex = commits.length - 1;
	} else {
		goodIndex = findIndex(goodInputEl);
	}
	if (!badInputEl.value) {
		badIndex = 0;
	} else {
		badIndex = findIndex(badInputEl);
	}
	startBisect();
});

let goodIndex = -1;
let currentIndex = -1;
let badIndex = -1;

let isBisecting = false;
function startBisect() {
	startFormEl.style.display = "none";
	bisectingEl.style.display = "";
	const { estimatedSteps } = computeStepsLeft();
	stepsLeftProgressEl.max = estimatedSteps;
	isBisecting = true;
	updateAll();
}

globalThis.good = function () {
	goodIndex = currentIndex;
	updateAll();
};
globalThis.bad = function () {
	badIndex = currentIndex;
	updateAll();
};

document.addEventListener("keydown", (e) => {
	if (isBisecting) {
		if (e.code == "KeyG") good();
		if (e.code == "KeyB") bad();
	}
});

function computeStepsLeft() {
	const rangeSize = Math.abs(goodIndex - badIndex);
	const estimatedSteps = Math.ceil(Math.log2(rangeSize));
	return { rangeSize, estimatedSteps };
}

/**
 * @param {string} sha
 */
function getCommitUrl(sha) {
	return `https://commit-${sha}.renda.studio/`;
}

/**
 * - Updates the current commit so that it sits in between the good and bad commit.
 * - Updates ui to represent the new state.
 * - Opens a new page with a build of the current commit.
 */
function updateAll() {
	// Update current commit so that it sits in between the good and bad commit.
	currentIndex = Math.round((goodIndex + badIndex) / 2);

	const good = commits[goodIndex];
	const current = commits[currentIndex];
	const bad = commits[badIndex];

	const { estimatedSteps, rangeSize } = computeStepsLeft();

	// Update comit status els
	{
		commitStatusesEl.innerHTML = "";

		/** @param {string} str */
		function escapeHtml(str) {
			const p = document.createElement("p");
			p.appendChild(document.createTextNode(str));
			return p.innerHTML;
		}

		/**
		 * @param {string} type
		 * @param {string} message
		 * @param {string} sha
		 */
		function createStatusEl(type, message, sha) {
			const el = document.createElement("div");
			el.classList.add("commit-section");
			const shortSha = sha.slice(0, 7);
			el.innerHTML = `
				<h3>${escapeHtml(message)}</h3>
				<div>${escapeHtml(type)}</div>
				<small><a href="${escapeHtml(getCommitUrl(sha))}" target="_blank">${escapeHtml(shortSha)}</a></small>
			`;

			commitStatusesEl.appendChild(el);
		}

		createStatusEl("Last known good", good.message, good.sha);
		if (estimatedSteps > 0) {
			createStatusEl("Current", current.message, current.sha);
		}
		createStatusEl("First known bad", bad.message, bad.sha);
	}

	if (estimatedSteps > 0) {
		window.open(getCommitUrl(current.sha));
	}

	const stepsStr = estimatedSteps > 1 ? "steps" : "step";
	rangeEl.textContent = `Range has ${rangeSize + 1} commits`;
	stepsLeftLabelEl.textContent = `Estimated ${estimatedSteps} ${stepsStr} left:`;
	stepsLeftProgressEl.value = stepsLeftProgressEl.max - estimatedSteps;

	if (estimatedSteps == 0) {
		bisectingEl.style.display = "none";
		doneEl.style.display = "";
		isBisecting = false;
	}
}

copyResultsButtonEl.addEventListener("click", async (e) => {
	e.preventDefault();
	const good = commits[goodIndex];
	const bad = commits[badIndex];

	const content = `Last known good:
${good.sha}

First known bad:
${bad.sha}
`;

	let success = true;
	try {
		await navigator.clipboard.writeText(content);
	} catch {
		success = false;
	}
	copyResultsButtonEl.textContent = success ? "Copied" : "Error";
	setTimeout(() => {
		copyResultsButtonEl.textContent = "Copy results";
	}, 1500);
});
