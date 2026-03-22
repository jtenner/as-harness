import { beforeEach, describe, it, TestContext } from "../mocha";
import { hasActiveArtifactFrame } from "../exports";
import { recordActiveArtifactFrameSource } from "../internal/artifact-frame";
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
		recordActiveArtifactFrameSource(
			"assembly/test/artifact-frame-smoke.ts",
			15,
			2,
		);
		captureWhenActive();
	});

	it("artifact test", (_context: TestContext): void => {
		recordActiveArtifactFrameSource(
			"assembly/test/artifact-frame-smoke.ts",
			20,
			2,
		);
		captureWhenActive();
	});
});
