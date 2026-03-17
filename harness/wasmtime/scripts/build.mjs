import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distPath = join(packageDir, "dist", "wasmtime.node");

function artifactFilename() {
	switch (process.platform) {
		case "darwin":
			return "libas_harness_wasmtime.dylib";
		case "win32":
			return "as_harness_wasmtime.dll";
		default:
			return "libas_harness_wasmtime.so";
	}
}

mkdirSync(join(packageDir, "dist"), { recursive: true });

execFileSync("cargo", ["build", "--release"], {
	cwd: packageDir,
	stdio: "inherit",
});

copyFileSync(
	join(packageDir, "target", "release", artifactFilename()),
	distPath,
);
