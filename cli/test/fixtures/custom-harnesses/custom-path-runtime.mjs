import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createHarness } = require(__JS_HARNESS_MODULE_PATH__);

export default {
	name: "fixture-path-js",
	createHarness,
};
