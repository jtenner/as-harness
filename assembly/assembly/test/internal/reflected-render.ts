import { addReflectedValueKeyValuePair } from "../../internal/reflected-value";
import { stringifyReflectedValue } from "../../internal/reflected-render";

class ReflectedRenderLeaf {
	label: string;

	constructor(label: string) {
		this.label = label;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:label", this.label);
	}
}

class ReflectedRenderNode {
	name: string;
	leaf: ReflectedRenderLeaf;

	constructor(name: string, leaf: ReflectedRenderLeaf) {
		this.name = name;
		this.leaf = leaf;
	}

	__asHarnessAddReflectedValueKeyValuePairs(): void {
		addReflectedValueKeyValuePair("field:name", this.name);
		addReflectedValueKeyValuePair("field:leaf", this.leaf);
	}
}

assert(stringifyReflectedValue<i32>(42) == "42");
assert(stringifyReflectedValue<string>("line\nvalue") == '"line\nvalue"');
assert(stringifyReflectedValue<Array<i32>>([1, 2, 3]) == "[1, 2, 3]");
assert(
	stringifyReflectedValue<ReflectedRenderNode>(
		new ReflectedRenderNode("runner", new ReflectedRenderLeaf("leaf")),
	) == '{field:name: "runner", field:leaf: {field:label: "leaf"}}',
);
