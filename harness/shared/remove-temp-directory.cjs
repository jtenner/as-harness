"use strict";

const { rmSync } = require("node:fs");

const DEFAULT_REMOVE_RETRY_ATTEMPTS = 120;
const DEFAULT_REMOVE_RETRY_DELAY_MS = 250;
const RETRYABLE_REMOVE_ERROR_CODES = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);

function sleepSync(milliseconds) {
	if (
		typeof milliseconds !== "number" ||
		!Number.isFinite(milliseconds) ||
		milliseconds <= 0
	) {
		return;
	}

	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isRetryableRemoveError(error) {
	if (!error || typeof error !== "object") {
		return false;
	}

	return RETRYABLE_REMOVE_ERROR_CODES.has(error.code);
}

function removeTempDirectory(tempDirectory, options = {}) {
	const remove = options.remove || rmSync;
	const sleep = options.sleep || sleepSync;
	const maxAttempts =
		typeof options.maxAttempts === "number" && options.maxAttempts > 0
			? options.maxAttempts
			: DEFAULT_REMOVE_RETRY_ATTEMPTS;
	const retryDelayMs =
		typeof options.retryDelayMs === "number" && options.retryDelayMs >= 0
			? options.retryDelayMs
			: DEFAULT_REMOVE_RETRY_DELAY_MS;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			remove(tempDirectory, {
				force: true,
				recursive: true,
			});
			return;
		} catch (error) {
			if (!isRetryableRemoveError(error) || attempt >= maxAttempts) {
				throw error;
			}

			sleep(retryDelayMs);
		}
	}
}

module.exports = {
	DEFAULT_REMOVE_RETRY_ATTEMPTS,
	DEFAULT_REMOVE_RETRY_DELAY_MS,
	isRetryableRemoveError,
	removeTempDirectory,
	sleepSync,
};
