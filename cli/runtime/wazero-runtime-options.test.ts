import { expect, test } from "bun:test";
import {
	WAZERO_PARALLEL_ENV_VAR,
	shouldRunWazeroInBand,
} from "./wazero-runtime-options";

test("shouldRunWazeroInBand defaults Linux to in-band execution", () => {
	expect(shouldRunWazeroInBand({ env: {}, platform: "linux" })).toBe(true);
	expect(shouldRunWazeroInBand({ env: {}, platform: "darwin" })).toBe(false);
	expect(shouldRunWazeroInBand({ env: {}, platform: "win32" })).toBe(false);
});

test("shouldRunWazeroInBand allows forcing Linux worker-thread execution", () => {
	expect(
		shouldRunWazeroInBand({
			env: { [WAZERO_PARALLEL_ENV_VAR]: "1" },
			platform: "linux",
		}),
	).toBe(false);
});
