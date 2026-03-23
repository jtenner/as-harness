#!/usr/bin/env bun

import { HOST_VALIDATION_TARGETS } from "../cli/source-host-targets";

console.log(
	JSON.stringify({
		include: HOST_VALIDATION_TARGETS,
	}),
);
