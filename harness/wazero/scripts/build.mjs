import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const cacheDir = path.join(projectDir, ".cache");
const distDir = path.join(projectDir, "dist");
const outputPath = path.join(distDir, "wazero.node");
const nodeRoot = path.dirname(path.dirname(process.execPath));

mkdirSync(cacheDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

const includeDir = await resolveNodeIncludeDir();
const env = {
	...process.env,
	CGO_CFLAGS: [process.env.CGO_CFLAGS, `-I${includeDir}`].filter(Boolean).join(" "),
	GOCACHE: process.env.GOCACHE || path.join(cacheDir, "go-build"),
};

if (process.platform === "linux") {
	env.CGO_LDFLAGS = [process.env.CGO_LDFLAGS, "-Wl,--allow-shlib-undefined"].filter(Boolean).join(" ");
} else if (process.platform === "darwin") {
	env.CGO_LDFLAGS = [process.env.CGO_LDFLAGS, "-Wl,-undefined,dynamic_lookup"].filter(Boolean).join(" ");
} else if (process.platform === "win32") {
	const nodeLibrary = await resolveWindowsNodeLibrary();
	env.CGO_LDFLAGS = [process.env.CGO_LDFLAGS, nodeLibrary].filter(Boolean).join(" ");
} else {
	throw new Error(`Unsupported platform for Go N-API build: ${process.platform}`);
}

execFileSync(
	"go",
	["build", "-buildmode=c-shared", "-trimpath", "-o", outputPath, "."],
	{
		cwd: projectDir,
		env,
		stdio: "inherit",
	},
);

async function resolveNodeIncludeDir() {
	const candidates = [
		process.env.NODE_API_INCLUDE_DIR,
		process.env.npm_config_nodedir ? path.join(process.env.npm_config_nodedir, "include", "node") : null,
		process.env.npm_config_nodedir,
		path.join(nodeRoot, "include", "node"),
	].filter(Boolean);

	for (const candidate of candidates) {
		const header = path.join(candidate, "node_api.h");
		if (existsSync(header)) {
			return candidate;
		}
	}

	const downloadedIncludeDir = await resolveDownloadedNodeIncludeDir();
	if (downloadedIncludeDir) {
		return downloadedIncludeDir;
	}

	throw new Error(
		[
			"Unable to find node_api.h.",
			"Set NODE_API_INCLUDE_DIR, set npm_config_nodedir, or allow the default Node headers download.",
		].join(" "),
	);
}

async function resolveDownloadedNodeIncludeDir() {
	const headersUrl = process.release?.headersUrl;
	if (!headersUrl) {
		return null;
	}

	const version = process.version;
	const downloadDir = path.join(cacheDir, "node", version, "headers");
	const extractedRoot = path.join(downloadDir, `node-${version}`);
	const includeDir = path.join(extractedRoot, "include", "node");
	const includeHeader = path.join(includeDir, "node_api.h");
	if (existsSync(includeHeader)) {
		return includeDir;
	}

	if (process.env.AS_HARNESS_SKIP_NODE_HEADERS_DOWNLOAD === "1") {
		throw new Error(
			[
				"Unable to find node_api.h for the active Node installation.",
				"Set NODE_API_INCLUDE_DIR, set npm_config_nodedir, or allow the default Node headers download.",
			].join(" "),
		);
	}

	mkdirSync(downloadDir, { recursive: true });

	const archivePath = path.join(downloadDir, path.basename(new URL(headersUrl).pathname));
	if (!existsSync(archivePath)) {
		const response = await fetch(headersUrl);
		if (!response.ok) {
			throw new Error(
				`Failed to download ${headersUrl}: ${response.status} ${response.statusText}`,
			);
		}

		writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
	}

	execFileSync("tar", ["-xzf", archivePath, "-C", downloadDir], {
		stdio: "inherit",
	});

	if (existsSync(includeHeader)) {
		return includeDir;
	}

	throw new Error(
		[
			`Downloaded Node headers from ${headersUrl},`,
			"but could not find include/node/node_api.h after extraction.",
		].join(" "),
	);
}

async function resolveWindowsNodeLibrary() {
	if (process.env.NODE_API_LIB_FILE && existsSync(process.env.NODE_API_LIB_FILE)) {
		return process.env.NODE_API_LIB_FILE;
	}

	const candidates = [
		process.env.npm_config_nodedir ? path.join(process.env.npm_config_nodedir, "node.lib") : null,
		process.env.npm_config_nodedir ? path.join(process.env.npm_config_nodedir, process.arch, "node.lib") : null,
		process.env.npm_config_nodedir ? path.join(process.env.npm_config_nodedir, windowsReleaseArch(), "node.lib") : null,
		path.join(nodeRoot, "node.lib"),
	];

	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) {
			return candidate;
		}
	}

	const downloadDir = path.join(cacheDir, "node", `v${process.versions.node}`, windowsReleaseArch());
	const downloadPath = path.join(downloadDir, "node.lib");

	if (existsSync(downloadPath)) {
		return downloadPath;
	}

	if (process.env.AS_HARNESS_SKIP_NODE_LIB_DOWNLOAD === "1") {
		throw new Error(
			[
				"Unable to find node.lib for Windows linking.",
				"Set NODE_API_LIB_FILE, set npm_config_nodedir, or allow the default node.lib download.",
			].join(" "),
		);
	}

	mkdirSync(downloadDir, { recursive: true });

	const url = `https://nodejs.org/download/release/v${process.versions.node}/${windowsReleaseArch()}/node.lib`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
	}

	writeFileSync(downloadPath, Buffer.from(await response.arrayBuffer()));
	return downloadPath;
}

function windowsReleaseArch() {
	switch (process.arch) {
		case "x64":
			return "win-x64";
		case "arm64":
			return "win-arm64";
		case "ia32":
			return "win-x86";
		default:
			throw new Error(`Unsupported Windows architecture for Node-API build: ${process.arch}`);
	}
}
