const assert = require("node:assert/strict");
const test = require("node:test");

const addon = require("../dist/wazero.node");

test("loads the Go-backed N-API addon", () => {
	assert.equal(addon.name, "wazero");
	assert.equal(addon.language, "go");
	assert.equal(addon.hello(), "hello from go");
});
