"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
	DEFAULT_REMOVE_RETRY_DELAY_MS,
	isRetryableRemoveError,
	removeTempDirectory,
} = require("./remove-temp-directory.cjs");

test("isRetryableRemoveError accepts the Windows temp-tree cleanup errors", () => {
	assert.equal(isRetryableRemoveError({ code: "EPERM" }), true);
	assert.equal(isRetryableRemoveError({ code: "EBUSY" }), true);
	assert.equal(isRetryableRemoveError({ code: "ENOTEMPTY" }), true);
	assert.equal(isRetryableRemoveError({ code: "ENOENT" }), false);
	assert.equal(isRetryableRemoveError(null), false);
});

test("removeTempDirectory retries retryable failures until removal succeeds", () => {
	const calls = [];
	const sleeps = [];
	let attempts = 0;

	removeTempDirectory("/tmp/example", {
		remove(path, options) {
			calls.push({ options, path });
			attempts += 1;
			if (attempts < 3) {
				const error = new Error("still locked");
				error.code = "EPERM";
				throw error;
			}
		},
		sleep(milliseconds) {
			sleeps.push(milliseconds);
		},
	});

	assert.equal(calls.length, 3);
	assert.deepEqual(calls[0], {
		options: {
			force: true,
			recursive: true,
		},
		path: "/tmp/example",
	});
	assert.deepEqual(sleeps, [
		DEFAULT_REMOVE_RETRY_DELAY_MS,
		DEFAULT_REMOVE_RETRY_DELAY_MS,
	]);
});

test("removeTempDirectory rethrows non-retryable failures immediately", () => {
	const error = new Error("missing");
	error.code = "ENOENT";
	let sleepCalls = 0;

	assert.throws(
		() =>
			removeTempDirectory("/tmp/example", {
				remove() {
					throw error;
				},
				sleep() {
					sleepCalls += 1;
				},
			}),
		(error) => error === error,
	);
	assert.equal(sleepCalls, 0);
});
