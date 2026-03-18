import {
  clearActiveTraversalTarget,
  setActiveTraversalTarget,
} from "./execution-state";
import { executeNode } from "./executor";
import { nodeFound } from "./events";
import { DeclarationMode } from "./imports";
import { Node, rootNode } from "./node";
import { didCallbackTrap } from "./trampoline";

let stagedReplayParent: Node | null = null;

function invokeStagedReplayParent(): void {
  if (stagedReplayParent === null) {
    unreachable();
  }

  changetype<Node>(stagedReplayParent).rediscoverChildren();
}

function shouldPruneChildren(parent: Node): bool {
  return parent.parent !== null && parent.declarationMode == DeclarationMode.Skip;
}

function clearTraversalReplayNodes(replayedNodes: Array<Node>): void {
  for (let index = replayedNodes.length - 1; index >= 0; index--) {
    unchecked(replayedNodes[index]).clearReplayState();
  }
}

function resolveTraversalChildren(
  parent: Node,
  replayedNodes: Array<Node>,
): Array<Node> | null {
  if (parent.parent === null) {
    return parent.getChildren();
  }

  stagedReplayParent = parent;
  const trapped = didCallbackTrap(invokeStagedReplayParent);
  stagedReplayParent = null;
  if (trapped) {
    parent.clearReplayState();
    return null;
  }

  replayedNodes.push(parent);
  return parent.getReplayChildren();
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

function findNodeByIndexFromWithReplay(
  parent: Node,
  nodeIndex: StaticArray<u32>,
  replayedNodes: Array<Node>,
): Node | null {
  let cursor: Node = parent;

  for (let index: i32 = 0, length = nodeIndex.length; index < length; index++) {
    if (shouldPruneChildren(cursor)) {
      return null;
    }

    const children = resolveTraversalChildren(cursor, replayedNodes);
    if (children === null) {
      return null;
    }

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

export function findNodeByIndexFrom(
  parent: Node,
  nodeIndex: StaticArray<u32>,
): Node | null {
  const replayedNodes = new Array<Node>();
  const node = findNodeByIndexFromWithReplay(parent, nodeIndex, replayedNodes);
  clearTraversalReplayNodes(replayedNodes);
  return node;
}

export function findNodeByIndex(nodeIndex: StaticArray<u32>): Node | null {
  return findNodeByIndexFrom(rootNode, nodeIndex);
}

function discoverImmediateChildrenOfWithReplay(
  parent: Node,
  replayedNodes: Array<Node>,
): i32 {
  if (shouldPruneChildren(parent)) {
    return 0;
  }

  const children = resolveTraversalChildren(parent, replayedNodes);
  if (children === null) {
    return -1;
  }

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

export function runNodeByIndexFrom(
  parent: Node,
  nodeIndex: StaticArray<u32>,
): bool {
  const replayedNodes = new Array<Node>();
  setActiveTraversalTarget(nodeIndex);
  const node = findNodeByIndexFromWithReplay(parent, nodeIndex, replayedNodes);
  if (node === null) {
    clearTraversalReplayNodes(replayedNodes);
    clearActiveTraversalTarget();
    return false;
  }

  const ok = executeNode(node);
  clearTraversalReplayNodes(replayedNodes);
  clearActiveTraversalTarget();
  return ok;
}

export function runNodeByIndex(nodeIndex: StaticArray<u32>): bool {
  return runNodeByIndexFrom(rootNode, nodeIndex);
}

export function discoverImmediateChildrenOf(parent: Node): i32 {
  const replayedNodes = new Array<Node>();
  const count = discoverImmediateChildrenOfWithReplay(parent, replayedNodes);
  clearTraversalReplayNodes(replayedNodes);
  return count;
}

export function discoverRootNodes(): i32 {
  setActiveTraversalTarget([] as StaticArray<u32>);
  const count = discoverImmediateChildrenOf(rootNode);
  clearActiveTraversalTarget();
  return count;
}

export function discoverChildrenByIndexFrom(
  parent: Node,
  nodeIndex: StaticArray<u32>,
): i32 {
  const replayedNodes = new Array<Node>();
  setActiveTraversalTarget(nodeIndex);
  const node = findNodeByIndexFromWithReplay(parent, nodeIndex, replayedNodes);
  if (node === null) {
    clearTraversalReplayNodes(replayedNodes);
    clearActiveTraversalTarget();
    return -1;
  }

  const count = discoverImmediateChildrenOfWithReplay(node, replayedNodes);
  clearTraversalReplayNodes(replayedNodes);
  clearActiveTraversalTarget();
  return count;
}

export function discoverChildrenByIndex(nodeIndex: StaticArray<u32>): i32 {
  return discoverChildrenByIndexFrom(rootNode, nodeIndex);
}
