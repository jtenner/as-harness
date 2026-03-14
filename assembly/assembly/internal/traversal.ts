import { executeNode } from "./executor";
import { Node, rootNode } from "./node";

export function findNodeByIndexFrom(
  parent: Node,
  nodeIndex: StaticArray<u32>,
): Node | null {
  let cursor: Node = parent;

  for (let index: i32 = 0, length = nodeIndex.length; index < length; index++) {
    const children = cursor.getChildren();
    const ordinal = unchecked(nodeIndex[index]);

    if (<i32>ordinal >= children.length) {
      return null;
    }

    cursor = unchecked(children[ordinal]);
  }

  return cursor;
}

export function findNodeByIndex(nodeIndex: StaticArray<u32>): Node | null {
  return findNodeByIndexFrom(rootNode, nodeIndex);
}

export function runNodeByIndexFrom(
  parent: Node,
  nodeIndex: StaticArray<u32>,
): bool {
  const node = findNodeByIndexFrom(parent, nodeIndex);
  if (node === null) {
    return false;
  }

  executeNode(node);
  return true;
}

export function runNodeByIndex(nodeIndex: StaticArray<u32>): bool {
  return runNodeByIndexFrom(rootNode, nodeIndex);
}
