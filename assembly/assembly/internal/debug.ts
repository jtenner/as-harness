import {
	getActiveArtifactFrameSourceColumn,
	getActiveArtifactFrameSourceFile,
	getActiveArtifactFrameSourceLine,
} from "./artifact-frame";
import { debug } from "./events";
import { DebugSourceKind, rawAbort } from "./imports";

function clampTraceValueCount(value: i32): i32 {
	if (value < 0) {
		return 0;
	}

	return value > 5 ? 5 : value;
}

function toTraceValues(
	valueCount: i32,
	a0: f64,
	a1: f64,
	a2: f64,
	a3: f64,
	a4: f64,
): Array<f64> {
	const values = new Array<f64>();
	const clampedValueCount = clampTraceValueCount(valueCount);

	if (clampedValueCount > 0) values.push(a0);
	if (clampedValueCount > 1) values.push(a1);
	if (clampedValueCount > 2) values.push(a2);
	if (clampedValueCount > 3) values.push(a3);
	if (clampedValueCount > 4) values.push(a4);

	return values;
}

export function harnessTrace(
	message: string,
	valueCount: i32 = 0,
	a0: f64 = 0.0,
	a1: f64 = 0.0,
	a2: f64 = 0.0,
	a3: f64 = 0.0,
	a4: f64 = 0.0,
): void {
	debug(
		DebugSourceKind.Trace,
		toTraceValues(valueCount, a0, a1, a2, a3, a4),
		message,
		getActiveArtifactFrameSourceFile(),
		getActiveArtifactFrameSourceLine(),
		getActiveArtifactFrameSourceColumn(),
	);
}

export function harnessAbort(
	message: string | null = null,
	fileName: string | null = null,
	lineNumber: i32 = 0,
	columnNumber: i32 = 0,
): void {
	debug(
		DebugSourceKind.Abort,
		new Array<f64>(),
		message === null ? "" : message,
		fileName === null ? "" : fileName,
		lineNumber,
		columnNumber,
	);
	rawAbort(message, fileName, lineNumber, columnNumber);
	unreachable();
}
