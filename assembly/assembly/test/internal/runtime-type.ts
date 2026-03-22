import {
	isRuntimeTypeInstance,
	runtimeTypeIdForValue,
} from "../../internal/runtime-type";

class RuntimeTypeLeaf {
	label: string;

	constructor(label: string) {
		this.label = label;
	}
}

function testRuntimeTypeIds(): void {
	assert(runtimeTypeIdForValue<string>("uvu") == idof<string>());
	assert(
		runtimeTypeIdForValue<ArrayBuffer>(new ArrayBuffer(4)) ==
			idof<ArrayBuffer>(),
	);
	assert(
		runtimeTypeIdForValue<Uint8Array>(new Uint8Array(2)) == idof<Uint8Array>(),
	);
}

function testRuntimeTypeInstanceChecks(): void {
	assert(isRuntimeTypeInstance<string>("uvu", idof<string>()));
	assert(!isRuntimeTypeInstance<string>("uvu", idof<ArrayBuffer>()));
	assert(
		isRuntimeTypeInstance<RuntimeTypeLeaf>(
			new RuntimeTypeLeaf("leaf"),
			idof<RuntimeTypeLeaf>(),
		),
	);
	assert(
		!isRuntimeTypeInstance<RuntimeTypeLeaf>(
			new RuntimeTypeLeaf("leaf"),
			idof<Uint8Array>(),
		),
	);
}

testRuntimeTypeIds();
testRuntimeTypeInstanceChecks();
