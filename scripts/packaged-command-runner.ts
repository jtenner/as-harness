export const COMMAND_TIMEOUT_ENV_VAR = "AS_HARNESS_TIMEOUT_MS";
export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;

export function createPackagedCommandRunnerSource() {
	return String.raw`
const { spawn, spawnSync } = require("node:child_process");
const {
	closeSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const cwd = process.argv[1];
const command = process.argv.slice(2);
const timeoutMs = Number(process.env.${COMMAND_TIMEOUT_ENV_VAR} || "${DEFAULT_COMMAND_TIMEOUT_MS}");

function readTextFile(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function killProcessTree(child) {
	if (!child || typeof child.pid !== "number" || child.pid <= 0) {
		return;
	}

	if (process.platform === "win32") {
		try {
			spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
				stdio: "ignore",
				windowsHide: true,
			});
			return;
		} catch {}
	}

	try {
		child.kill("SIGKILL");
	} catch {}
}

async function main() {
	if (command.length === 0) {
		throw new Error("packaged command runner requires a command");
	}

	const tempDirectory = mkdtempSync(
		join(tmpdir(), "as-harness-packaged-command-"),
	);
	const stdoutPath = join(tempDirectory, "stdout.txt");
	const stderrPath = join(tempDirectory, "stderr.txt");
	let stdoutFd = -1;
	let stderrFd = -1;
	let child = null;
	let timedOut = false;
	let exitCode = 1;
	let errorMessage = "";
	let payload = null;

	try {
		stdoutFd = openSync(stdoutPath, "w");
		stderrFd = openSync(stderrPath, "w");
		child = spawn(command[0], command.slice(1), {
			cwd,
			stdio: ["ignore", stdoutFd, stderrFd],
			windowsHide: true,
		});
		closeSync(stdoutFd);
		closeSync(stderrFd);
		stdoutFd = -1;
		stderrFd = -1;

		await new Promise((resolve) => {
			let settled = false;
			const finish = (nextExitCode, nextErrorMessage = "") => {
				if (settled) {
					return;
				}

				settled = true;
				if (typeof nextExitCode === "number") {
					exitCode = nextExitCode;
				}
				if (nextErrorMessage.length > 0) {
					errorMessage = nextErrorMessage;
				}
				clearTimeout(timer);
				resolve();
			};

			const timer = setTimeout(() => {
				timedOut = true;
				killProcessTree(child);
				finish(124);
			}, timeoutMs);
			if (typeof timer.unref === "function") {
				timer.unref();
			}

			child.on("error", (error) => {
				finish(
					1,
					String(error && (error.message || error) ? error.message || error : error),
				);
			});
			child.on("close", (code) => {
				finish(typeof code === "number" ? code : exitCode);
			});
		});

			payload = {
				exitCode: timedOut ? 124 : exitCode,
				stdout: readTextFile(stdoutPath),
				stderr: readTextFile(stderrPath),
				timedOut,
				errorMessage: timedOut ? "" : errorMessage,
			};
		} finally {
			if (stdoutFd !== -1) {
				closeSync(stdoutFd);
			}
		if (stderrFd !== -1) {
			closeSync(stderrFd);
		}
		if (timedOut) {
			killProcessTree(child);
			}
			rmSync(tempDirectory, { force: true, recursive: true });
		}

		process.stdout.write(JSON.stringify(payload));
		process.exit(errorMessage.length > 0 && !timedOut ? 1 : 0);
	}

main().catch((error) => {
	process.stderr.write(String(error && (error.stack || error.message || error)));
	process.exit(1);
});
`;
}
