const { createRequire } = require("node:module");

const requireFromHere = createRequire(__filename);
const { createHarness } = requireFromHere(__JS_HARNESS_MODULE_PATH__);

exports.runtime = {
	name: "fixture-package-js",
	createHarness,
};
