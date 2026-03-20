package main

import (
	"encoding/binary"
	"reflect"
	"testing"
)

func appendUint32(bytes []byte, value uint32) []byte {
	var field [4]byte
	binary.LittleEndian.PutUint32(field[:], value)
	return append(bytes, field[:]...)
}

func encodeNodeIndexPayload(nodeIndex []uint32) []byte {
	payload := make([]byte, 0, 4+4*len(nodeIndex))
	payload = appendUint32(payload, uint32(len(nodeIndex)))
	for _, node := range nodeIndex {
		payload = appendUint32(payload, node)
	}
	return payload
}

func TestDecodeEventSnapshotIncludesNodeIdForNodeEvents(t *testing.T) {
	nodeID := uint32(0x22118877)
	nodeStartPayload := appendUint32(encodeNodeIndexPayload([]uint32{0, 1, 2}), nodeID)
	if event, ok := decodeEventSnapshot(eventKindNodeStart, nodeStartPayload); !ok {
		t.Fatal("decodeEventSnapshot(nodeStart) should parse nodeId")
	} else if event.Type != "nodeStart" || event.NodeID != nodeID || !reflect.DeepEqual(event.NodeIndex, []uint32{0, 1, 2}) {
		t.Fatalf("unexpected nodeStart snapshot: %#v", event)
	}

	nodePassPayload := appendUint32(encodeNodeIndexPayload([]uint32{3, 4}), nodeID)
	if event, ok := decodeEventSnapshot(eventKindNodePass, nodePassPayload); !ok {
		t.Fatal("decodeEventSnapshot(nodePass) should parse nodeId")
	} else if event.Type != "nodePass" || event.NodeID != nodeID || !reflect.DeepEqual(event.NodeIndex, []uint32{3, 4}) {
		t.Fatalf("unexpected nodePass snapshot: %#v", event)
	}
}

func TestDecodeEventSnapshotIncludesNodeIdForCallbackEvents(t *testing.T) {
	nodeID := uint32(0x11223344)
	callbackStartPayload := []byte{1, 0, 0, 0}
	callbackStartPayload = appendUint32(callbackStartPayload, nodeID)
	callbackStartPayload = append(callbackStartPayload, encodeNodeIndexPayload([]uint32{5})...)
	if event, ok := decodeEventSnapshot(eventKindCallbackStart, callbackStartPayload); !ok {
		t.Fatal("decodeEventSnapshot(callbackStart) should parse nodeId")
	} else if event.Type != "callbackStart" || event.NodeID != nodeID || event.Hook != 1 || !reflect.DeepEqual(event.NodeIndex, []uint32{5}) {
		t.Fatalf("unexpected callbackStart snapshot: %#v", event)
	}

	callbackPassPayload := []byte{2, 0, 0, 0}
	callbackPassPayload = appendUint32(callbackPassPayload, nodeID)
	callbackPassPayload = append(callbackPassPayload, encodeNodeIndexPayload([]uint32{7})...)
	if event, ok := decodeEventSnapshot(eventKindCallbackPass, callbackPassPayload); !ok {
		t.Fatal("decodeEventSnapshot(callbackPass) should parse nodeId")
	} else if event.Type != "callbackPass" || event.NodeID != nodeID || event.Hook != 2 || !reflect.DeepEqual(event.NodeIndex, []uint32{7}) {
		t.Fatalf("unexpected callbackPass snapshot: %#v", event)
	}
}

func TestDecodeEventSnapshotIncludesNodeIdForFailEvents(t *testing.T) {
	nodeID := uint32(0x44556677)
	nodeFailPayload := []byte{1, 0, 0, 0}
	nodeFailPayload = appendUint32(nodeFailPayload, nodeID)
	nodeFailPayload = append(nodeFailPayload, encodeNodeIndexPayload([]uint32{2, 3})...)
	if event, ok := decodeEventSnapshot(eventKindNodeFail, nodeFailPayload); !ok {
		t.Fatal("decodeEventSnapshot(nodeFail) should parse nodeId")
	} else if event.Type != "nodeFail" || event.NodeID != nodeID || event.FailureKind != 1 || !reflect.DeepEqual(event.NodeIndex, []uint32{2, 3}) {
		t.Fatalf("unexpected nodeFail snapshot: %#v", event)
	}

	callbackFailPayload := []byte{3, 2, 0, 0}
	callbackFailPayload = appendUint32(callbackFailPayload, nodeID)
	callbackFailPayload = append(callbackFailPayload, encodeNodeIndexPayload([]uint32{8})...)
	if event, ok := decodeEventSnapshot(eventKindCallbackFail, callbackFailPayload); !ok {
		t.Fatal("decodeEventSnapshot(callbackFail) should parse nodeId")
	} else if event.Type != "callbackFail" || event.NodeID != nodeID || event.Hook != 3 || event.FailureKind != 2 || !reflect.DeepEqual(event.NodeIndex, []uint32{8}) {
		t.Fatalf("unexpected callbackFail snapshot: %#v", event)
	}
}

func TestDecodeEventSnapshotRejectsOldCallbackPayloadShape(t *testing.T) {
	oldPayload := []byte{1, 0, 0, 0}
	oldPayload = append(oldPayload, encodeNodeIndexPayload([]uint32{4})...)
	if _, ok := decodeEventSnapshot(eventKindCallbackStart, oldPayload); ok {
		t.Fatal("callbackStart payloads without nodeId should be rejected")
	}
}

func TestDecodeEventSnapshotRejectsOldNodeStartPayloadShape(t *testing.T) {
	oldPayload := encodeNodeIndexPayload([]uint32{0, 1})
	if _, ok := decodeEventSnapshot(eventKindNodeStart, oldPayload); ok {
		t.Fatal("nodeStart payloads without nodeId should be rejected")
	}
}
