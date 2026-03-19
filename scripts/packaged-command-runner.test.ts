import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
	COMMAND_TIMEOUT_ENV_VAR,
	createPackagedCommandRunnerSource,
} from "./packaged-command-runner";

const nodeExecutable = Bun.which("node");

test.if(Boolean(nodeExecutable))(
	"packaged command runner does not wait on inherited pipe handles from descendant processes",
	async () => {
		const tempDirectory = await mkdtemp(
			join(tmpdir(), "as-harness-packaged-command-test-"),
		);

		try {
			const childScriptPath = join(tempDirectory, "child.cjs");
			await writeFile(
				childScriptPath,
				[
					'const { spawn } = require("node:child_process");',
					'process.stdout.write("PASS 1 passed, 0 failed, 1 discovered with js.\\n");',
					"const detachedChild = spawn(",
					'\tprocess.execPath,',
					'\t["-e", "setTimeout(() => {}, 30000)"],',
					"\t{",
					'\t\tdetached: true,',
					'\t\tstdio: ["ignore", "inherit", "inherit"],',
					"\t},",
					");",
					"detachedChild.unref();",
					"process.exit(0);",
					"",
				].join("\n"),
				"utf8",
			);

			const startedAt = performance.now();
			const processHandle = Bun.spawn(
				[
					nodeExecutable as string,
					"-e",
					createPackagedCommandRunnerSource(),
					tempDirectory,
					nodeExecutable as string,
					childScriptPath,
				],
				{
					cwd: tempDirectory,
					env: {
						...process.env,
						[COMMAND_TIMEOUT_ENV_VAR]: "2000",
					},
					stderr: "pipe",
					stdout: "pipe",
				},
			);

			const [exitCode, stdout, stderr] = await Promise.all([
				processHandle.exited,
				new Response(processHandle.stdout).text(),
				new Response(processHandle.stderr).text(),
			]);
			const durationMs = performance.now() - startedAt;

			expect(exitCode).toBe(0);
			expect(stderr).toBe("");
			expect(durationMs).toBeLessThan(2000);

			const result = JSON.parse(stdout) as {
				exitCode: number;
				stdout: string;
				stderr: string;
				timedOut: boolean;
			};
			expect(result.exitCode).toBe(0);
			expect(result.timedOut).toBe(false);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"PASS 1 passed, 0 failed, 1 discovered with js.",
			);
		} finally {
			await rm(tempDirectory, { force: true, recursive: true });
		}
	},
);
