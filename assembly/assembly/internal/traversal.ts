import { executeNode } from "./executor";
import { nodeFound } from "./events";
import { DeclarationMode } from "./imports";
import { Node, rootNode } from "./node";

function shouldPruneChildren(parent: Node): bool {
  return parent.parent !== null && parent.declarationMode == DeclarationMode.Skip;
}

function resolveTraversalChildren(parent: Node): Array<Node> {
  if (parent.parent === null) {
    return parent.getChildren();
  }

  return parent.rediscoverChildren();
}

function hasOnlyChildren(children: Array<Node>): bool {
  for (let index: i32 = 0, length = children.length; index < length; index++) {
    if (unchecked(children[index]).only) {
      return true;
    }
  }

  return false;
}

function isVisibleChild(child: Node, hasOnlyChild: bool): bool {
  return !hasOnlyChild || child.only;
}

export function findNodeByIndexFrom(
  parent: Node,
  nodeIndex: StaticArray<u32>,
): Node | null {
  let cursor: Node = parent;

  for (let index: i32 = 0, length = nodeIndex.length; index < length; index++) {
    if (shouldPruneChildren(cursor)) {
      return null;
    }

    const children = resolveTraversalChildren(cursor);
    const ordinal = unchecked(nodeIndex[index]);
    const onlyFiltered = hasOnlyChildren(children);

    if (<i32>ordinal >= children.length) {
      return null;
    }

    const child = unchecked(children[ordinal]);
    if (!isVisibleChild(child, onlyFiltered)) {
      return null;
    }

    cursor = child;
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

  return executeNode(node);
}

export function runNodeByIndex(nodeIndex: StaticArray<u32>): bool {
  return runNodeByIndexFrom(rootNode, nodeIndex);
}

export function discoverImmediateChildrenOf(parent: Node): i32 {
  if (shouldPruneChildren(parent)) {
    return 0;
  }

  const children = resolveTraversalChildren(parent);
  const onlyFiltered = hasOnlyChildren(children);
  let visibleCount = 0;

  for (let index: i32 = 0, length = children.length; index < length; index++) {
    const child = unchecked(children[index]);
    if (!isVisibleChild(child, onlyFiltered)) {
      continue;
    }

    nodeFound(
      child.getNodeIndex(),
      child.kind,
      child.declarationMode,
      child.name,
    );
    visibleCount++;
  }

  return visibleCount;
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
