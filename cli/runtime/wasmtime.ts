import { setCompilerOptionValue, type Runtime } from "./types";

export const wasmtimeRuntime: Runtime = {
	name: "wasmtime",
	mutateCompilerArguments(compilerArguments) {
		setCompilerOptionValue(compilerArguments, "--exportStart", "__start");
	},
	createHarness() {
		throw new Error("The wasmtime runtime is not implemented yet.");
	},
};
