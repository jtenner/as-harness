import { expect, test } from "bun:test";
import type { CommandResult, HarnessRunReport } from "./verify-packaged-cli";
import {
	createPackagedSmokeEnvironment,
	formatBuildFailure,
	formatPackagedSmokeFailure,
	formatVerifierSupervisionFailure,
	renderMarkdownSummary,
} from "./verify-packaged-cli";

function createCommandResult(
	overrides: Partial<CommandResult> = {},
): CommandResult {
	return {
		command: ["as-harness", "run", "suite.test.ts"],
		cwd: "/tmp/project",
		exitCode: 1,
		stderr: "stderr payload",
		stdout: "stdout payload",
		timedOut: false,
		...overrides,
	};
}

test("renderMarkdownSummary distinguishes timeout results from ordinary failures", () => {
	const reports: HarnessRunReport[] = [
		{
			...createCommandResult({ exitCode: 0, timedOut: false }),
			durationMs: 111,
			harness: "js",
		},
		{
			...createCommandResult({ exitCode: 124, timedOut: true }),
			durationMs: 222,
			harness: "wazero",
		},
	];

	const markdown = renderMarkdownSummary(
		"bun-linux-x64",
		["js", "wazero"],
		reports,
	);

	expect(markdown).toContain("# Packaged CLI Verification: bun-linux-x64");
	expect(markdown).toContain("- `js`: pass in 111ms");
	expect(markdown).toContain("- `wazero`: timeout in 222ms");
});

test("formatPackagedSmokeFailure marks timed out packaged commands as bundled-host hangs instead of verifier supervision", () => {
	const message = formatPackagedSmokeFailure({
		harness: "wazero",
		result: createCommandResult({
			exitCode: 124,
			stderr: "wazero trace",
			stdout: "",
			timedOut: true,
		}),
		target: "bun-linux-x64",
		timeoutMs: 2000,
	});

	expect(message).toContain("Packaged wazero smoke failed for bun-linux-x64.");
	expect(message).toContain("timed out after 2000ms");
	expect(message).toContain("bundled-host hang or stuck packaged command");
	expect(message).toContain("not verifier supervision");
	expect(message).toContain("stderr:\nwazero trace");
});

test("formatPackagedSmokeFailure marks non-timeout failures as real packaged command failures", () => {
	const message = formatPackagedSmokeFailure({
		harness: "js",
		result: createCommandResult({
			exitCode: 3,
			stderr: "bad runtime output",
			stdout: "",
			timedOut: false,
		}),
		target: "bun-windows-x64",
	});

	expect(message).toContain("Packaged js smoke failed for bun-windows-x64.");
	expect(message).toContain("exited with code 3");
	expect(message).toContain("real packaged command failure");
	expect(message).toContain("not verifier supervision");
});

test("formatBuildFailure distinguishes build-step failures from verifier supervision", () => {
	const message = formatBuildFailure(
		"bun-linux-x64",
		createCommandResult({
			command: ["bun", "run", "./cli/build.ts", "bun-linux-x64"],
			exitCode: 1,
			stderr: "compile failed",
		}),
	);

	expect(message).toContain("Packaged CLI build failed for bun-linux-x64.");
	expect(message).toContain("real build-step failure");
	expect(message).toContain("stderr:\ncompile failed");
});

test("formatBuildFailure uses the packaged-build timeout budget for timed out builds", () => {
	const message = formatBuildFailure(
		"bun-darwin-x64",
		createCommandResult({
			command: ["bun", "run", "./cli/build.ts", "bun-darwin-x64"],
			exitCode: 124,
			stderr: "",
			stdout: "building local wazero addon for CLI packaging",
			timedOut: true,
		}),
	);

	expect(message).toContain("Packaged CLI build failed for bun-darwin-x64.");
	expect(message).toContain("timed out after 180000ms");
	expect(message).toContain("real build-step failure");
	expect(message).toContain(
		"stdout:\nbuilding local wazero addon for CLI packaging",
	);
});

test("formatVerifierSupervisionFailure reports verifier wrapper problems separately", () => {
	const message = formatVerifierSupervisionFailure({
		error: new Error("runner JSON parse failed"),
		harness: "wazero",
		phase: "smoke",
		target: "bun-linux-x64",
	});

	expect(message).toContain(
		"Verifier supervision failed while running packaged wazero smoke for bun-linux-x64.",
	);
	expect(message).toContain("points at verifier supervision");
	expect(message).toContain("runner JSON parse failed");
});

test("createPackagedSmokeEnvironment strips tool-manager env while preserving runtime essentials", () => {
	const environment = createPackagedSmokeEnvironment(
		{
			HOME: "/tmp/home",
			PATH: "/usr/bin:/bin",
			TMPDIR: "/tmp/original",
			MISE_LOG_LEVEL: "debug",
			RUSTUP_TOOLCHAIN: "1.94.0",
		},
		{
			AS_HARNESS_TRACE_WAZERO: "1",
			TEMP: "/tmp/runtime",
			TMP: "/tmp/runtime",
			TMPDIR: "/tmp/runtime",
		},
	);

	expect(environment).toEqual({
		AS_HARNESS_TRACE_WAZERO: "1",
		HOME: "/tmp/home",
		PATH: "/usr/bin:/bin",
		TEMP: "/tmp/runtime",
		TMP: "/tmp/runtime",
		TMPDIR: "/tmp/runtime",
	});
});
