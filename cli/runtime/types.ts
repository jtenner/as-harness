import type { Harness } from "../../harness/shared/harness-types";

export interface Runtime {
	name: string;
	mutateCompilerArguments(compilerArguments: string[]): void;
	createHarness(wasmBytes: Uint8Array): Harness;
}

export function setCompilerOptionValue(
	compilerArguments: string[],
	flag: string,
	value: string,
) {
	const optionIndex = compilerArguments.indexOf(flag);
	if (optionIndex === -1) {
		compilerArguments.push(flag, value);
		return;
	}

	if (optionIndex === compilerArguments.length - 1) {
		compilerArguments.push(value);
		return;
	}

	compilerArguments[optionIndex + 1] = value;
}
