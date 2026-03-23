#!/usr/bin/env bun

export const BUN_STANDALONE_RELEASE_ACK_ENV =
	"AS_HARNESS_ALLOW_UNRESOLVED_BUN_STANDALONE_RELEASE";

const BUN_LICENSE_GUIDANCE_URL = "https://bun.sh/docs/project/license";

export function createBunStandaloneReleasePolicyMessage() {
	return [
		"Refusing to publish packaged Bun standalone release artifacts by default.",
		`Bun's official license guidance documents downstream static-link redistribution obligations for standalone executables: ${BUN_LICENSE_GUIDANCE_URL}`,
		"as-harness has not yet implemented a documented, repo-owned redistribution path that satisfies those obligations.",
		"Public packaged releases must stay gated until that work lands.",
		`If you are intentionally performing a non-public or otherwise explicitly accepted override run, set ${BUN_STANDALONE_RELEASE_ACK_ENV}=1 for this invocation.`,
	].join("\n");
}

export function assertBunStandaloneReleasePolicy(
	environment: NodeJS.ProcessEnv = process.env,
) {
	if (environment[BUN_STANDALONE_RELEASE_ACK_ENV] === "1") {
		return;
	}

	throw new Error(createBunStandaloneReleasePolicyMessage());
}

async function main() {
	assertBunStandaloneReleasePolicy();
	console.log(
		`${BUN_STANDALONE_RELEASE_ACK_ENV}=1 acknowledged; continuing Bun standalone release path.`,
	);
}

if (import.meta.main) {
	await main();
}
