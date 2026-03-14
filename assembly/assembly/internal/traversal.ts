import { executeNode } from "./executor";
import { nodeFound } from "./events";
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

export function discoverImmediateChildrenOf(parent: Node): i32 {
  const children = parent.getChildren();

  for (let index: i32 = 0, length = children.length; index < length; index++) {
    const child = unchecked(children[index]);
    nodeFound(
      child.getNodeIndex(),
      child.kind,
      child.declarationMode,
      child.name,
    );
  }

  return children.length;
}

export function discoverRootNodes(): i32 {
  return discoverImmediateChildrenOf(rootNode);
}

export function discoverChildrenByIndexFrom(
  parent: Node,
  nodeIndex: StaticArray<u32>,
): i32 {
  const node = findNodeByIndexFrom(parent, nodeIndex);
  if (node === null) {
    return -1;
  }

  return discoverImmediateChildrenOf(node);
}

export function discoverChildrenByIndex(nodeIndex: StaticArray<u32>): i32 {
  return discoverChildrenByIndexFrom(rootNode, nodeIndex);
}
