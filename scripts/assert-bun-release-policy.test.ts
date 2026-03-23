import { expect, test } from "bun:test";
import {
	assertBunStandaloneReleasePolicy,
	BUN_STANDALONE_RELEASE_ACK_ENV,
	createBunStandaloneReleasePolicyMessage,
} from "./assert-bun-release-policy";

test("assertBunStandaloneReleasePolicy rejects unresolved Bun standalone releases by default", () => {
	expect(() => assertBunStandaloneReleasePolicy({})).toThrow(
		createBunStandaloneReleasePolicyMessage(),
	);
});

test("assertBunStandaloneReleasePolicy allows explicit acknowledged override runs", () => {
	expect(() =>
		assertBunStandaloneReleasePolicy({
			[BUN_STANDALONE_RELEASE_ACK_ENV]: "1",
		}),
	).not.toThrow();
});
