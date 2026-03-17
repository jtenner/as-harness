#!/usr/bin/env bun

import { HOST_VALIDATION_TARGETS } from "../cli/build-targets";

console.log(
	JSON.stringify({
		include: HOST_VALIDATION_TARGETS,
	}),
);
