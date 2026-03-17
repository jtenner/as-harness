#!/usr/bin/env bun

import { RELEASE_BUILD_TARGETS } from "../cli/build-targets";

console.log(
	JSON.stringify({
		include: RELEASE_BUILD_TARGETS,
	}),
);
