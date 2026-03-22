import { beforeEach, describe, it, TestContext } from "../mocha";
import { hasActiveArtifactFrame } from "../exports";
import { captureActiveArtifactFrame } from "../internal/imports";

export * from "../exports";

function captureWhenActive(): void {
	if (!hasActiveArtifactFrame()) {
		return;
	}

	captureActiveArtifactFrame();
}

describe("artifact suite", (_context): void => {
	beforeEach((_hookContext: TestContext): void => {
		captureWhenActive();
	});

	it("artifact test", (_context: TestContext): void => {
		captureWhenActive();
	});
});
