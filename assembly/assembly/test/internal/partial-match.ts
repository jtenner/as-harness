import { isPartialMatch } from "../../internal/partial-match";
import { addReflectedValueKeyValuePair } from "../../internal/reflected-value";

class PartialMatchLeaf {
	label: string;
	count: i32;

	constructor(label: string, count: i32) {
		this.label = label;
		this.count = count;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:label", this.label);
		addReflectedValueKeyValuePair("field:count", this.count);
	}
}

class PartialMatchNode {
	name: string;
	leaf: PartialMatchLeaf;
	tags: Array<string>;

	constructor(name: string, leaf: PartialMatchLeaf, tags: Array<string>) {
		this.name = name;
		this.leaf = leaf;
		this.tags = tags;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:name", this.name);
		addReflectedValueKeyValuePair("field:leaf", this.leaf);
		addReflectedValueKeyValuePair("field:tags", this.tags);
	}
}

function testPartialMatchPrimitives(): void {
	assert(isPartialMatch<string, string>("uvu matcher", "match"));
	assert(isPartialMatch<i32, i32>(4, 4));
	assert(!isPartialMatch<i32, i32>(4, 5));
	assert(isPartialMatch<Array<i32>, Array<i32>>([1, 2, 3], [1, 2]));
	assert(!isPartialMatch<Array<i32>, Array<i32>>([1, 2], [1, 3]));
}

function testPartialMatchCollections(): void {
	const values = new Set<string>();
	values.add("alpha");
	values.add("beta");
	values.add("gamma");
	const expectedValues = new Set<string>();
	expectedValues.add("beta");
	expectedValues.add("alpha");
	assert(isPartialMatch(values, expectedValues));

	const map = new Map<string, i32>();
	map.set("alpha", 1);
	map.set("beta", 2);
	const expectedMap = new Map<string, i32>();
	expectedMap.set("beta", 2);
	assert(isPartialMatch(map, expectedMap));
}

function testPartialMatchManagedClasses(): void {
	const actual = new PartialMatchNode(
		"runner",
		new PartialMatchLeaf("nested leaf", 3),
		["host", "guest"],
	);
	const expected = new PartialMatchNode(
		"run",
		new PartialMatchLeaf("leaf", 3),
		["host"],
	);
	assert(isPartialMatch(actual, expected));

	const wrongExpected = new PartialMatchNode(
		"runner",
		new PartialMatchLeaf("nested leaf", 4),
		["host"],
	);
	assert(!isPartialMatch(actual, wrongExpected));
}

testPartialMatchPrimitives();
testPartialMatchCollections();
testPartialMatchManagedClasses();
