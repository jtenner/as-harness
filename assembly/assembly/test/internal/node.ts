import { DeclarationMode, NodeKind } from "../../internal/imports";
import { Node, currentNode, rootNode } from "../../internal/node";

let callbackRuns: i32 = 0;

function declareRootChildren(): void {
  callbackRuns++;

  currentNode.createChild(NodeKind.Test, "first child", DeclarationMode.Skip);
  currentNode.createChild(NodeKind.Describe, "second child", DeclarationMode.Todo);
}

function testRootNodeDefaults(): void {
  assert(rootNode.kind == NodeKind.Root);
  assert(rootNode.name == "~root");
  assert(rootNode.parent === null);
  assert(rootNode.ordinal == 0);
  assert(currentNode === rootNode);
}

function testNodeMetadataAndLazyChildren(): void {
  const root = new Node(
    NodeKind.Describe,
    "root",
    DeclarationMode.Normal,
    declareRootChildren,
  );

  assert(root.kind == NodeKind.Describe);
  assert(root.name == "root");
  assert(root.declarationMode == DeclarationMode.Normal);
  assert(root.parent === null);
  assert(root.ordinal == 0);

  const firstChildren = root.getChildren();
  assert(callbackRuns == 1);
  assert(firstChildren.length == 2);

  const firstChild = unchecked(firstChildren[0]);
  assert(firstChild.kind == NodeKind.Test);
  assert(firstChild.name == "first child");
  assert(firstChild.declarationMode == DeclarationMode.Skip);
  assert(firstChild.parent === root);
  assert(firstChild.ordinal == 0);

  const secondChild = unchecked(firstChildren[1]);
  assert(secondChild.kind == NodeKind.Describe);
  assert(secondChild.name == "second child");
  assert(secondChild.declarationMode == DeclarationMode.Todo);
  assert(secondChild.parent === root);
  assert(secondChild.ordinal == 1);

  const secondChildren = root.getChildren();
  assert(callbackRuns == 1);
  assert(secondChildren === firstChildren);
}

function testManualAddChild(): void {
  const root = new Node(NodeKind.Describe, "root");
  const child = root.createChild(NodeKind.Test, "child");
  const children = root.getChildren();

  assert(children.length == 1);
  assert(unchecked(children[0]) === child);
  assert(child.parent === root);
  assert(child.ordinal == 0);
}

testRootNodeDefaults();
testNodeMetadataAndLazyChildren();
testManualAddChild();
