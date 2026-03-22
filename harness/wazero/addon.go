package main

/*
#include <stdint.h>
#include <stdlib.h>
#include <node_api.h>

static inline size_t as_harness_typed_array_byte_length(napi_typedarray_type array_type, size_t length) {
	switch (array_type) {
		case napi_int8_array:
		case napi_uint8_array:
		case napi_uint8_clamped_array:
			return length;
		case napi_int16_array:
		case napi_uint16_array:
#ifdef NODE_API_HAS_FLOAT16_ARRAY
		case napi_float16_array:
#endif
			return length * 2;
		case napi_int32_array:
		case napi_uint32_array:
		case napi_float32_array:
			return length * 4;
		case napi_float64_array:
		case napi_bigint64_array:
		case napi_biguint64_array:
			return length * 8;
		default:
			return 0;
	}
}

extern napi_value GoCreateHarness(napi_env env, napi_callback_info info);
extern napi_value GoOnNodeFound(napi_env env, napi_callback_info info);
extern napi_value GoOnNodeStart(napi_env env, napi_callback_info info);
extern napi_value GoOnNodePass(napi_env env, napi_callback_info info);
extern napi_value GoOnNodeFail(napi_env env, napi_callback_info info);
extern napi_value GoOnFailMessage(napi_env env, napi_callback_info info);
extern napi_value GoOnCallbackStart(napi_env env, napi_callback_info info);
extern napi_value GoOnCallbackPass(napi_env env, napi_callback_info info);
extern napi_value GoOnCallbackFail(napi_env env, napi_callback_info info);
extern napi_value GoOnDiagnostic(napi_env env, napi_callback_info info);
extern napi_value GoOnLog(napi_env env, napi_callback_info info);
extern napi_value GoCallI32(napi_env env, napi_callback_info info);
extern napi_value GoDiscoverHarness(napi_env env, napi_callback_info info);
extern napi_value GoRunHarness(napi_env env, napi_callback_info info);
extern napi_value GoStartHarness(napi_env env, napi_callback_info info);
extern napi_value GoGetCoverageSnapshot(napi_env env, napi_callback_info info);
extern napi_value GoResetCoverage(napi_env env, napi_callback_info info);
extern napi_value GoCloseHarness(napi_env env, napi_callback_info info);
extern void GoFinalizeHarness(node_api_basic_env env, void* data, void* hint);
*/
import "C"

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	goruntime "runtime"
	"sort"
	"sync"
	"unicode/utf16"
	"unsafe"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

const harnessIDProperty = "__asHarnessId"
const allocateNodeIndexBufferExport = "allocateNodeIndexBuffer"
const discoverExport = "discover"
const runExport = "run"
const abortModuleName = "env"
const writeEventModuleName = "as-harness"
const coversModuleName = "__asCovers"
const invokeExport = "invoke"
const invokeStagedImport = "invoke_staged"
const uint32ByteLength = 4
const wazeroEngineInterpreter = "interpreter"
const eventKindNodeFound = 1
const eventKindNodeStart = 2
const eventKindNodePass = 3
const eventKindFailMessage = 4
const eventKindCallbackStart = 5
const eventKindCallbackPass = 6
const eventKindDiagnostic = 7
const eventKindNodeFail = 8
const eventKindCallbackFail = 9
const eventKindLog = 10
const nodeKindTest = 1
const declarationModeNormal = 1

type callbackSlot int

const (
	nodeFoundSlot callbackSlot = iota
	nodeStartSlot
	nodePassSlot
	nodeFailSlot
	failMessageSlot
	callbackStartSlot
	callbackPassSlot
	callbackFailSlot
	diagnosticSlot
	logSlot
	callbackSlotCount
)

type harnessState struct {
	runtime   wazero.Runtime
	compiled  wazero.CompiledModule
	coverage  *coverageCollector
	env       C.napi_env
	callbacks [callbackSlotCount]C.napi_ref
}

type writeEventSink interface {
	Handle(kind uint32, payload []byte)
}

type hostCallState struct {
	harness  *harnessState
	sink     writeEventSink
	coverage *coverageCollector
}

type nodeSnapshot struct {
	NodeIndex              []uint32
	NodeID                 uint32
	ParentNodeID           uint32
	DeclarationOrder       uint32
	SequenceMode           uint32
	PreferredRunnerMode    uint32
	PreferredFailurePolicy uint32
	DependencyNodeIDs      []uint32
	Only                   bool
	ExpectFailure          bool
	Kind                   uint32
	DeclarationMode        uint32
	Name                   string
}

type immediateDiscoverySnapshot struct {
	OK    bool
	Nodes []nodeSnapshot
}

type discoverySnapshot struct {
	OK        bool
	Nodes     []nodeSnapshot
	TestCount uint32
}

type eventSnapshot struct {
	Type                   string
	NodeIndex              []uint32
	NodeID                 uint32
	ParentNodeID           uint32
	DeclarationOrder       uint32
	SequenceMode           uint32
	PreferredRunnerMode    uint32
	PreferredFailurePolicy uint32
	DependencyNodeIDs      []uint32
	Only                   bool
	ExpectFailure          bool
	Kind                   uint32
	DeclarationMode        uint32
	Name                   string
	Hook                   uint32
	FailureKind            uint32
	Message                string
	Values                 []float64
}

type executionSnapshot struct {
	Node   nodeSnapshot
	OK     bool
	Events []eventSnapshot
}

type branchSnapshot struct {
	Root       nodeSnapshot
	Discovery  discoverySnapshot
	Executions []executionSnapshot
	OK         bool
}

type startSnapshot struct {
	OK                  bool
	DiscoveryOK         bool
	DiscoveredTestCount uint32
	TopLevelNodes       []nodeSnapshot
	WorkerCount         uint32
	Branches            []branchSnapshot
	Coverage            *coverageSnapshot
}

type coveragePoint struct {
	ID        uint32
	File      string
	Line      int32
	Column    int32
	CoverType uint32
}

type coverageSnapshot struct {
	Points     []coveragePoint
	CoveredIDs []uint32
}

type coverageCollector struct {
	mu      sync.Mutex
	points  map[uint32]coveragePoint
	covered map[uint32]struct{}
}

type nodeCollector struct {
	nodes []nodeSnapshot
}

type eventCollector struct {
	events []eventSnapshot
}

type hostCallStateContextKey struct{}

func newCoverageCollector() *coverageCollector {
	return &coverageCollector{
		points:  map[uint32]coveragePoint{},
		covered: map[uint32]struct{}{},
	}
}

func (collector *coverageCollector) Declare(point coveragePoint) {
	if collector == nil {
		return
	}

	collector.mu.Lock()
	defer collector.mu.Unlock()

	if _, ok := collector.points[point.ID]; !ok {
		collector.points[point.ID] = point
	}
}

func (collector *coverageCollector) Hit(id uint32) {
	if collector == nil {
		return
	}

	collector.mu.Lock()
	defer collector.mu.Unlock()

	collector.covered[id] = struct{}{}
}

func (collector *coverageCollector) Snapshot() *coverageSnapshot {
	if collector == nil {
		return nil
	}

	collector.mu.Lock()
	defer collector.mu.Unlock()

	points := make([]coveragePoint, 0, len(collector.points))
	for _, point := range collector.points {
		points = append(points, point)
	}
	sort.Slice(points, func(left int, right int) bool {
		if points[left].File != points[right].File {
			return points[left].File < points[right].File
		}
		if points[left].Line != points[right].Line {
			return points[left].Line < points[right].Line
		}
		if points[left].Column != points[right].Column {
			return points[left].Column < points[right].Column
		}
		if points[left].CoverType != points[right].CoverType {
			return points[left].CoverType < points[right].CoverType
		}
		return points[left].ID < points[right].ID
	})

	coveredIDs := make([]uint32, 0, len(collector.covered))
	for id := range collector.covered {
		coveredIDs = append(coveredIDs, id)
	}
	sort.Slice(coveredIDs, func(left int, right int) bool {
		return coveredIDs[left] < coveredIDs[right]
	})

	if len(points) == 0 && len(coveredIDs) == 0 {
		return nil
	}

	return &coverageSnapshot{
		Points:     points,
		CoveredIDs: coveredIDs,
	}
}

func (collector *coverageCollector) Reset() {
	if collector == nil {
		return
	}

	collector.mu.Lock()
	defer collector.mu.Unlock()

	collector.points = map[uint32]coveragePoint{}
	collector.covered = map[uint32]struct{}{}
}

var (
	harnessMu     sync.Mutex
	nextHarnessID int64 = 1
	harnesses           = map[int64]*harnessState{}
)

func main() {}

func must(status C.napi_status, env C.napi_env, message string) bool {
	if status == C.napi_ok {
		return true
	}

	cause := C.CString(message)
	defer C.free(unsafe.Pointer(cause))

	C.napi_throw_error(env, nil, cause)
	return false
}

func throwTypeError(env C.napi_env, message string) bool {
	cause := C.CString(message)
	defer C.free(unsafe.Pointer(cause))

	C.napi_throw_type_error(env, nil, cause)
	return false
}

func createString(env C.napi_env, value string) C.napi_value {
	cValue := C.CString(value)
	defer C.free(unsafe.Pointer(cValue))

	var result C.napi_value
	if !must(C.napi_create_string_utf8(env, cValue, C.NAPI_AUTO_LENGTH, &result), env, "failed to create string") {
		return nil
	}

	return result
}

func createBoolean(env C.napi_env, value bool) C.napi_value {
	var result C.napi_value
	boolValue := C.bool(false)
	if value {
		boolValue = C.bool(true)
	}

	if !must(C.napi_get_boolean(env, boolValue, &result), env, "failed to create boolean") {
		return nil
	}

	return result
}

func throwError(env C.napi_env, message string) bool {
	cause := C.CString(message)
	defer C.free(unsafe.Pointer(cause))

	C.napi_throw_error(env, nil, cause)
	return false
}

func undefined(env C.napi_env) C.napi_value {
	var result C.napi_value
	if !must(C.napi_get_undefined(env, &result), env, "failed to get undefined") {
		return nil
	}

	return result
}

func null(env C.napi_env) C.napi_value {
	var result C.napi_value
	if !must(C.napi_get_null(env, &result), env, "failed to get null") {
		return nil
	}

	return result
}

func createObject(env C.napi_env, message string) C.napi_value {
	var result C.napi_value
	if !must(C.napi_create_object(env, &result), env, message) {
		return nil
	}

	return result
}

func createFunction(env C.napi_env, name string, callback C.napi_callback) C.napi_value {
	cName := C.CString(name)
	defer C.free(unsafe.Pointer(cName))

	var result C.napi_value
	if !must(C.napi_create_function(env, cName, C.NAPI_AUTO_LENGTH, callback, nil, &result), env, "failed to create function") {
		return nil
	}

	return result
}

func setNamedProperty(env C.napi_env, target C.napi_value, name string, value C.napi_value) bool {
	cName := C.CString(name)
	defer C.free(unsafe.Pointer(cName))

	return must(C.napi_set_named_property(env, target, cName, value), env, "failed to set property")
}

func createResolvedPromise(env C.napi_env, value C.napi_value) C.napi_value {
	var deferred C.napi_deferred
	var promise C.napi_value
	if !must(C.napi_create_promise(env, &deferred, &promise), env, "failed to create promise") {
		return nil
	}

	if !must(C.napi_resolve_deferred(env, deferred, value), env, "failed to resolve promise") {
		return nil
	}

	return promise
}

func createInt64(env C.napi_env, value int64) C.napi_value {
	var result C.napi_value
	if !must(C.napi_create_int64(env, C.int64_t(value), &result), env, "failed to create int64") {
		return nil
	}

	return result
}

func createUint32(env C.napi_env, value uint32) C.napi_value {
	var result C.napi_value
	if !must(C.napi_create_uint32(env, C.uint32_t(value), &result), env, "failed to create uint32") {
		return nil
	}

	return result
}

func createDouble(env C.napi_env, value float64) C.napi_value {
	var result C.napi_value
	if !must(C.napi_create_double(env, C.double(value), &result), env, "failed to create double") {
		return nil
	}

	return result
}

func createArrayWithLength(env C.napi_env, length uint32) C.napi_value {
	var result C.napi_value
	if !must(C.napi_create_array_with_length(env, C.size_t(length), &result), env, "failed to create array") {
		return nil
	}

	return result
}

func setElement(env C.napi_env, target C.napi_value, index uint32, value C.napi_value) bool {
	return must(C.napi_set_element(env, target, C.uint32_t(index), value), env, "failed to set array element")
}

func getReferenceValue(env C.napi_env, ref C.napi_ref) (C.napi_value, bool) {
	var result C.napi_value
	if !must(C.napi_get_reference_value(env, ref, &result), env, "failed to resolve callback reference") {
		return nil, false
	}

	return result, true
}

func getCallbackArguments(env C.napi_env, info C.napi_callback_info, argc C.size_t) ([]C.napi_value, C.napi_value, bool) {
	if argc == 0 {
		var thisArg C.napi_value
		if !must(C.napi_get_cb_info(env, info, nil, nil, &thisArg, nil), env, "failed to read callback receiver") {
			return nil, nil, false
		}

		return nil, thisArg, true
	}

	args := make([]C.napi_value, int(argc))
	actual := argc
	var thisArg C.napi_value

	var argv *C.napi_value
	if len(args) > 0 {
		argv = &args[0]
	}

	if !must(C.napi_get_cb_info(env, info, &actual, argv, &thisArg, nil), env, "failed to read callback arguments") {
		return nil, nil, false
	}

	return args[:int(actual)], thisArg, true
}

func copyBytes(ptr unsafe.Pointer, length C.size_t) []byte {
	if ptr == nil || length == 0 {
		return []byte{}
	}

	source := unsafe.Slice((*byte)(ptr), int(length))
	bytes := make([]byte, len(source))
	copy(bytes, source)
	return bytes
}

func bytesFromValue(env C.napi_env, value C.napi_value) ([]byte, bool) {
	var isBuffer C.bool
	if !must(C.napi_is_buffer(env, value, &isBuffer), env, "failed to test buffer input") {
		return nil, false
	}

	if isBuffer {
		var data unsafe.Pointer
		var length C.size_t
		if !must(C.napi_get_buffer_info(env, value, &data, &length), env, "failed to read buffer bytes") {
			return nil, false
		}

		return copyBytes(data, length), true
	}

	var isTypedArray C.bool
	if !must(C.napi_is_typedarray(env, value, &isTypedArray), env, "failed to test typed array input") {
		return nil, false
	}

	if isTypedArray {
		var arrayType C.napi_typedarray_type
		var length C.size_t
		var data unsafe.Pointer
		var arrayBuffer C.napi_value
		var byteOffset C.size_t
		if !must(C.napi_get_typedarray_info(env, value, &arrayType, &length, &data, &arrayBuffer, &byteOffset), env, "failed to read typed array bytes") {
			return nil, false
		}

		_ = arrayBuffer
		_ = byteOffset

		return copyBytes(data, C.as_harness_typed_array_byte_length(arrayType, length)), true
	}

	var isArrayBuffer C.bool
	if !must(C.napi_is_arraybuffer(env, value, &isArrayBuffer), env, "failed to test array buffer input") {
		return nil, false
	}

	if isArrayBuffer {
		var data unsafe.Pointer
		var length C.size_t
		if !must(C.napi_get_arraybuffer_info(env, value, &data, &length), env, "failed to read array buffer bytes") {
			return nil, false
		}

		return copyBytes(data, length), true
	}

	return nil, throwTypeError(env, "createHarness expects a Buffer, Uint8Array, or ArrayBuffer")
}

func stringFromValue(env C.napi_env, value C.napi_value) (string, bool) {
	var valueType C.napi_valuetype
	if !must(C.napi_typeof(env, value, &valueType), env, "failed to read string type") {
		return "", false
	}

	if valueType != C.napi_string {
		return "", false
	}

	var length C.size_t
	if !must(C.napi_get_value_string_utf8(env, value, nil, 0, &length), env, "failed to read string length") {
		return "", false
	}

	buffer := make([]byte, int(length)+1)
	if !must(
		C.napi_get_value_string_utf8(
			env,
			value,
			(*C.char)(unsafe.Pointer(&buffer[0])),
			C.size_t(len(buffer)),
			&length,
		),
		env,
		"failed to read string bytes",
	) {
		return "", false
	}

	return string(buffer[:int(length)]), true
}

func contextWithHarnessState(ctx context.Context, state *harnessState) context.Context {
	return context.WithValue(ctx, hostCallStateContextKey{}, &hostCallState{harness: state})
}

func contextWithWriteEventSink(ctx context.Context, state *harnessState, sink writeEventSink) context.Context {
	return context.WithValue(ctx, hostCallStateContextKey{}, &hostCallState{harness: state, sink: sink})
}

func contextWithCoverageCollector(
	ctx context.Context,
	state *harnessState,
	sink writeEventSink,
	coverage *coverageCollector,
) context.Context {
	return context.WithValue(
		ctx,
		hostCallStateContextKey{},
		&hostCallState{harness: state, sink: sink, coverage: coverage},
	)
}

func harnessStateFromContext(ctx context.Context) *harnessState {
	callState, _ := ctx.Value(hostCallStateContextKey{}).(*hostCallState)
	if callState == nil {
		return nil
	}

	return callState.harness
}

func writeEventSinkFromContext(ctx context.Context) writeEventSink {
	callState, _ := ctx.Value(hostCallStateContextKey{}).(*hostCallState)
	if callState == nil {
		return nil
	}

	return callState.sink
}

func coverageCollectorFromContext(ctx context.Context) *coverageCollector {
	callState, _ := ctx.Value(hostCallStateContextKey{}).(*hostCallState)
	if callState == nil {
		return nil
	}

	return callState.coverage
}

func cloneNodeIndex(nodeIndex []uint32) []uint32 {
	if len(nodeIndex) == 0 {
		return []uint32{}
	}

	copyOf := make([]uint32, len(nodeIndex))
	copy(copyOf, nodeIndex)
	return copyOf
}

func decodeUint32(payload []byte, offset int) (uint32, int, bool) {
	if offset+4 > len(payload) {
		return 0, offset, false
	}

	return binary.LittleEndian.Uint32(payload[offset : offset+4]), offset + 4, true
}

func decodeNodeIndex(payload []byte, offset int) ([]uint32, int, bool) {
	length, nextOffset, ok := decodeUint32(payload, offset)
	if !ok {
		return nil, offset, false
	}

	requiredByteLength := int(length) * uint32ByteLength
	if nextOffset+requiredByteLength > len(payload) {
		return nil, offset, false
	}

	nodeIndex := make([]uint32, int(length))
	for index := 0; index < int(length); index++ {
		valueOffset := nextOffset + index*uint32ByteLength
		nodeIndex[index] = binary.LittleEndian.Uint32(payload[valueOffset : valueOffset+uint32ByteLength])
	}

	return nodeIndex, nextOffset + requiredByteLength, true
}

func readAssemblyString(memory api.Memory, pointer uint32) (string, bool) {
	if pointer == 0 {
		return "", true
	}
	if pointer < 4 {
		return "", false
	}

	lengthBytes, ok := memory.Read(pointer-4, 4)
	if !ok {
		return "", false
	}

	byteLength := binary.LittleEndian.Uint32(lengthBytes)
	utf16Bytes, ok := memory.Read(pointer, byteLength)
	if !ok {
		return "", false
	}
	if len(utf16Bytes)%2 != 0 {
		return "", false
	}

	codeUnits := make([]uint16, len(utf16Bytes)/2)
	for index := 0; index < len(codeUnits); index++ {
		offset := index * 2
		codeUnits[index] = binary.LittleEndian.Uint16(utf16Bytes[offset : offset+2])
	}

	return string(utf16.Decode(codeUnits)), true
}

func createNodeIndexValue(env C.napi_env, nodeIndex []uint32) (C.napi_value, bool) {
	result := createArrayWithLength(env, uint32(len(nodeIndex)))
	if result == nil {
		return nil, false
	}

	for index, value := range nodeIndex {
		if !setElement(env, result, uint32(index), createUint32(env, value)) {
			return nil, false
		}
	}

	return result, true
}

func createUint32SliceValue(env C.napi_env, values []uint32) (C.napi_value, bool) {
	result := createArrayWithLength(env, uint32(len(values)))
	if result == nil {
		return nil, false
	}

	for index, value := range values {
		if !setElement(env, result, uint32(index), createUint32(env, value)) {
			return nil, false
		}
	}

	return result, true
}

func createNodeEventObject(env C.napi_env, nodeIndex []uint32, nodeID uint32) (C.napi_value, bool) {
	result := createObject(env, "failed to create event object")
	if result == nil {
		return nil, false
	}

	nodeIndexValue, ok := createNodeIndexValue(env, nodeIndex)
	if !ok {
		return nil, false
	}

	if !setNamedProperty(env, result, "nodeIndex", nodeIndexValue) {
		return nil, false
	}
	if !setNamedProperty(env, result, "nodeId", createUint32(env, nodeID)) {
		return nil, false
	}

	return result, true
}

func decodeNodeFoundSnapshot(payload []byte) (nodeSnapshot, bool) {
	nodeIndex, offset, ok := decodeNodeIndex(payload, 0)
	if !ok || offset+24 > len(payload) {
		return nodeSnapshot{}, false
	}

	nodeID, nextOffset, ok := decodeUint32(payload, offset)
	if !ok {
		return nodeSnapshot{}, false
	}
	parentNodeID, nextOffset, ok := decodeUint32(payload, nextOffset)
	if !ok {
		return nodeSnapshot{}, false
	}
	declarationOrder, nextOffset, ok := decodeUint32(payload, nextOffset)
	if !ok || nextOffset+12 > len(payload) {
		return nodeSnapshot{}, false
	}

	kind := uint32(payload[nextOffset])
	mode := uint32(payload[nextOffset+1])
	sequenceMode := uint32(payload[nextOffset+2])
	only := payload[nextOffset+3] != 0
	expectFailure := payload[nextOffset+4] != 0
	preferredRunnerMode := uint32(payload[nextOffset+5])
	preferredFailurePolicy := uint32(payload[nextOffset+6])
	dependencyCount, nextOffset, ok := decodeUint32(payload, nextOffset+8)
	if !ok {
		return nodeSnapshot{}, false
	}
	dependencyByteLength := int(dependencyCount) * uint32ByteLength
	if nextOffset+dependencyByteLength+uint32ByteLength > len(payload) {
		return nodeSnapshot{}, false
	}
	dependencyNodeIDs := make([]uint32, 0, dependencyCount)
	for index := 0; index < int(dependencyCount); index++ {
		dependencyNodeID, _, ok := decodeUint32(payload, nextOffset+index*uint32ByteLength)
		if !ok {
			return nodeSnapshot{}, false
		}
		dependencyNodeIDs = append(dependencyNodeIDs, dependencyNodeID)
	}
	nameLength, nextOffset, ok := decodeUint32(payload, nextOffset+dependencyByteLength)
	if !ok {
		return nodeSnapshot{}, false
	}
	if nextOffset+int(nameLength) > len(payload) {
		return nodeSnapshot{}, false
	}

	return nodeSnapshot{
		NodeIndex:              cloneNodeIndex(nodeIndex),
		NodeID:                 nodeID,
		ParentNodeID:           parentNodeID,
		DeclarationOrder:       declarationOrder,
		SequenceMode:           sequenceMode,
		PreferredRunnerMode:    preferredRunnerMode,
		PreferredFailurePolicy: preferredFailurePolicy,
		DependencyNodeIDs:      dependencyNodeIDs,
		Only:                   only,
		ExpectFailure:          expectFailure,
		Kind:                   kind,
		DeclarationMode:        mode,
		Name:                   string(payload[nextOffset : nextOffset+int(nameLength)]),
	}, true
}

func createNodeFoundEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	node, ok := decodeNodeFoundSnapshot(payload)
	if !ok {
		return nil, false
	}

	result, ok := createNodeEventObject(env, node.NodeIndex, node.NodeID)
	if !ok {
		return nil, false
	}

	if !setNamedProperty(env, result, "kind", createUint32(env, node.Kind)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "parentNodeId", createUint32(env, node.ParentNodeID)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "declarationOrder", createUint32(env, node.DeclarationOrder)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "sequenceMode", createUint32(env, node.SequenceMode)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "preferredRunnerMode", createUint32(env, node.PreferredRunnerMode)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "preferredFailurePolicy", createUint32(env, node.PreferredFailurePolicy)) {
		return nil, false
	}
	dependencyNodeIDsValue, ok := createUint32SliceValue(env, node.DependencyNodeIDs)
	if !ok {
		return nil, false
	}
	if !setNamedProperty(env, result, "dependencyNodeIds", dependencyNodeIDsValue) {
		return nil, false
	}
	if !setNamedProperty(env, result, "only", createBoolean(env, node.Only)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "expectFailure", createBoolean(env, node.ExpectFailure)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "declarationMode", createUint32(env, node.DeclarationMode)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "name", createString(env, node.Name)) {
		return nil, false
	}

	return result, true
}

func createCallbackEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	if len(payload) < 12 {
		return nil, false
	}

	hook := uint32(payload[0])
	nodeID, _, ok := decodeUint32(payload, 4)
	if !ok {
		return nil, false
	}
	nodeIndex, _, ok := decodeNodeIndex(payload, 8)
	if !ok {
		return nil, false
	}

	result, ok := createNodeEventObject(env, nodeIndex, nodeID)
	if !ok {
		return nil, false
	}

	if !setNamedProperty(env, result, "hook", createUint32(env, hook)) {
		return nil, false
	}

	return result, true
}

func createNodeFailEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	if len(payload) < 12 {
		return nil, false
	}

	nodeID, _, ok := decodeUint32(payload, 4)
	if !ok {
		return nil, false
	}
	nodeIndex, _, ok := decodeNodeIndex(payload, 8)
	if !ok {
		return nil, false
	}

	result, ok := createNodeEventObject(env, nodeIndex, nodeID)
	if !ok {
		return nil, false
	}

	if !setNamedProperty(env, result, "failureKind", createUint32(env, uint32(payload[0]))) {
		return nil, false
	}

	return result, true
}

func createCallbackFailEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	if len(payload) < 12 {
		return nil, false
	}

	nodeID, _, ok := decodeUint32(payload, 4)
	if !ok {
		return nil, false
	}
	nodeIndex, _, ok := decodeNodeIndex(payload, 8)
	if !ok {
		return nil, false
	}

	result, ok := createNodeEventObject(env, nodeIndex, nodeID)
	if !ok {
		return nil, false
	}

	if !setNamedProperty(env, result, "hook", createUint32(env, uint32(payload[0]))) {
		return nil, false
	}
	if !setNamedProperty(env, result, "failureKind", createUint32(env, uint32(payload[1]))) {
		return nil, false
	}

	return result, true
}

func createFailMessageEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	result := createObject(env, "failed to create event object")
	if result == nil {
		return nil, false
	}

	if !setNamedProperty(env, result, "message", createString(env, string(payload))) {
		return nil, false
	}

	return result, true
}

func createDiagnosticEventObject(env C.napi_env, nodeIndex []uint32, message string) (C.napi_value, bool) {
	nodeIndexValue, ok := createNodeIndexValue(env, nodeIndex)
	if !ok {
		return nil, false
	}

	result := createObject(env, "failed to create event object")
	if result == nil {
		return nil, false
	}
	if !setNamedProperty(env, result, "nodeIndex", nodeIndexValue) {
		return nil, false
	}
	if !setNamedProperty(env, result, "message", createString(env, message)) {
		return nil, false
	}

	return result, true
}

func createDiagnosticEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	nodeIndex, offset, ok := decodeNodeIndex(payload, 0)
	if !ok {
		return nil, false
	}

	messageLength, nextOffset, ok := decodeUint32(payload, offset)
	if !ok {
		return nil, false
	}
	if nextOffset+int(messageLength) > len(payload) {
		return nil, false
	}
	return createDiagnosticEventObject(
		env,
		nodeIndex,
		string(payload[nextOffset:nextOffset+int(messageLength)]),
	)
}

func decodeLogPayload(payload []byte) (string, []float64, bool) {
	valueCount, offset, ok := decodeUint32(payload, 0)
	if !ok {
		return "", nil, false
	}

	values := make([]float64, 0, int(valueCount))
	for index := uint32(0); index < valueCount; index++ {
		if offset+8 > len(payload) {
			return "", nil, false
		}

		valueBits := binary.LittleEndian.Uint64(payload[offset : offset+8])
		values = append(values, math.Float64frombits(valueBits))
		offset += 8
	}

	messageLength, nextOffset, ok := decodeUint32(payload, offset)
	if !ok {
		return "", nil, false
	}
	if nextOffset+int(messageLength) > len(payload) {
		return "", nil, false
	}

	return string(payload[nextOffset : nextOffset+int(messageLength)]), values, true
}

func encodeLogPayload(message string, values []float64) []byte {
	messageBytes := []byte(message)
	payload := make([]byte, 4+len(values)*8+4+len(messageBytes))
	binary.LittleEndian.PutUint32(payload[0:4], uint32(len(values)))
	offset := 4

	for _, value := range values {
		binary.LittleEndian.PutUint64(
			payload[offset:offset+8],
			math.Float64bits(value),
		)
		offset += 8
	}

	binary.LittleEndian.PutUint32(payload[offset:offset+4], uint32(len(messageBytes)))
	offset += 4
	copy(payload[offset:], messageBytes)
	return payload
}

func createLogEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	message, values, ok := decodeLogPayload(payload)
	if !ok {
		return nil, false
	}

	result := createObject(env, "failed to create event object")
	if result == nil {
		return nil, false
	}

	if !setNamedProperty(env, result, "message", createString(env, message)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "source", createString(env, "trace")) {
		return nil, false
	}

	valuesValue := createArrayWithLength(env, uint32(len(values)))
	if valuesValue == nil {
		return nil, false
	}
	for index, value := range values {
		if !setElement(env, valuesValue, uint32(index), createDouble(env, value)) {
			return nil, false
		}
	}

	if !setNamedProperty(env, result, "values", valuesValue) {
		return nil, false
	}

	return result, true
}

func createEventValue(env C.napi_env, kind uint32, payload []byte) (C.napi_value, bool) {
	switch kind {
	case eventKindNodeFound:
		return createNodeFoundEvent(env, payload)
	case eventKindNodeStart, eventKindNodePass:
		nodeIndex, offset, ok := decodeNodeIndex(payload, 0)
		if !ok {
			return nil, false
		}
		nodeID, _, ok := decodeUint32(payload, offset)
		if !ok {
			return nil, false
		}
		return createNodeEventObject(env, nodeIndex, nodeID)
	case eventKindFailMessage:
		return createFailMessageEvent(env, payload)
	case eventKindCallbackStart, eventKindCallbackPass:
		return createCallbackEvent(env, payload)
	case eventKindNodeFail:
		return createNodeFailEvent(env, payload)
	case eventKindCallbackFail:
		return createCallbackFailEvent(env, payload)
	case eventKindDiagnostic:
		return createDiagnosticEvent(env, payload)
	case eventKindLog:
		return createLogEvent(env, payload)
	default:
		return nil, false
	}
}

func decodeEventSnapshot(kind uint32, payload []byte) (eventSnapshot, bool) {
	switch kind {
	case eventKindNodeFound:
		node, ok := decodeNodeFoundSnapshot(payload)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:                   "nodeFound",
			NodeIndex:              cloneNodeIndex(node.NodeIndex),
			NodeID:                 node.NodeID,
			ParentNodeID:           node.ParentNodeID,
			DeclarationOrder:       node.DeclarationOrder,
			SequenceMode:           node.SequenceMode,
			PreferredRunnerMode:    node.PreferredRunnerMode,
			PreferredFailurePolicy: node.PreferredFailurePolicy,
			DependencyNodeIDs:      append([]uint32(nil), node.DependencyNodeIDs...),
			Only:                   node.Only,
			ExpectFailure:          node.ExpectFailure,
			Kind:                   node.Kind,
			DeclarationMode:        node.DeclarationMode,
			Name:                   node.Name,
		}, true
	case eventKindNodeStart:
		nodeIndex, offset, ok := decodeNodeIndex(payload, 0)
		if !ok {
			return eventSnapshot{}, false
		}
		nodeID, _, ok := decodeUint32(payload, offset)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:      "nodeStart",
			NodeID:    nodeID,
			NodeIndex: cloneNodeIndex(nodeIndex),
		}, true
	case eventKindNodePass:
		nodeIndex, offset, ok := decodeNodeIndex(payload, 0)
		if !ok {
			return eventSnapshot{}, false
		}
		nodeID, _, ok := decodeUint32(payload, offset)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:      "nodePass",
			NodeID:    nodeID,
			NodeIndex: cloneNodeIndex(nodeIndex),
		}, true
	case eventKindFailMessage:
		return eventSnapshot{Type: "failMessage", Message: string(payload)}, true
	case eventKindCallbackStart:
		if len(payload) < 12 {
			return eventSnapshot{}, false
		}

		hook := uint32(payload[0])
		nodeID, _, ok := decodeUint32(payload, 4)
		if !ok {
			return eventSnapshot{}, false
		}
		nodeIndex, _, ok := decodeNodeIndex(payload, 8)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:      "callbackStart",
			NodeID:    nodeID,
			Hook:      hook,
			NodeIndex: cloneNodeIndex(nodeIndex),
		}, true
	case eventKindCallbackPass:
		if len(payload) < 12 {
			return eventSnapshot{}, false
		}

		hook := uint32(payload[0])
		nodeID, _, ok := decodeUint32(payload, 4)
		if !ok {
			return eventSnapshot{}, false
		}
		nodeIndex, _, ok := decodeNodeIndex(payload, 8)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:      "callbackPass",
			NodeID:    nodeID,
			Hook:      hook,
			NodeIndex: cloneNodeIndex(nodeIndex),
		}, true
	case eventKindDiagnostic:
		nodeIndex, offset, ok := decodeNodeIndex(payload, 0)
		if !ok {
			return eventSnapshot{}, false
		}

		messageLength, nextOffset, ok := decodeUint32(payload, offset)
		if !ok {
			return eventSnapshot{}, false
		}
		if nextOffset+int(messageLength) > len(payload) {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:      "diagnostic",
			NodeIndex: cloneNodeIndex(nodeIndex),
			Message:   string(payload[nextOffset : nextOffset+int(messageLength)]),
		}, true
	case eventKindNodeFail:
		if len(payload) < 12 {
			return eventSnapshot{}, false
		}

		nodeID, _, ok := decodeUint32(payload, 4)
		if !ok {
			return eventSnapshot{}, false
		}
		nodeIndex, _, ok := decodeNodeIndex(payload, 8)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:        "nodeFail",
			NodeID:      nodeID,
			FailureKind: uint32(payload[0]),
			NodeIndex:   cloneNodeIndex(nodeIndex),
		}, true
	case eventKindCallbackFail:
		if len(payload) < 12 {
			return eventSnapshot{}, false
		}

		hook := uint32(payload[0])
		nodeID, _, ok := decodeUint32(payload, 4)
		if !ok {
			return eventSnapshot{}, false
		}
		nodeIndex, _, ok := decodeNodeIndex(payload, 8)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:        "callbackFail",
			NodeID:      nodeID,
			Hook:        hook,
			FailureKind: uint32(payload[1]),
			NodeIndex:   cloneNodeIndex(nodeIndex),
		}, true
	case eventKindLog:
		message, values, ok := decodeLogPayload(payload)
		if !ok {
			return eventSnapshot{}, false
		}

		return eventSnapshot{
			Type:    "log",
			Message: message,
			Values:  append([]float64(nil), values...),
		}, true
	default:
		return eventSnapshot{}, false
	}
}

func (collector *nodeCollector) Handle(kind uint32, payload []byte) {
	if kind != eventKindNodeFound {
		return
	}

	node, ok := decodeNodeFoundSnapshot(payload)
	if !ok {
		return
	}

	collector.nodes = append(collector.nodes, node)
}

func (collector *eventCollector) Handle(kind uint32, payload []byte) {
	event, ok := decodeEventSnapshot(kind, payload)
	if !ok {
		return
	}

	collector.events = append(collector.events, event)
}

func callbackSlotForEventKind(kind uint32) (callbackSlot, bool) {
	switch kind {
	case eventKindNodeFound:
		return nodeFoundSlot, true
	case eventKindNodeStart:
		return nodeStartSlot, true
	case eventKindNodePass:
		return nodePassSlot, true
	case eventKindNodeFail:
		return nodeFailSlot, true
	case eventKindFailMessage:
		return failMessageSlot, true
	case eventKindCallbackStart:
		return callbackStartSlot, true
	case eventKindCallbackPass:
		return callbackPassSlot, true
	case eventKindCallbackFail:
		return callbackFailSlot, true
	case eventKindDiagnostic:
		return diagnosticSlot, true
	case eventKindLog:
		return logSlot, true
	default:
		return 0, false
	}
}

func dispatchEventPayload(state *harnessState, kind uint32, payload []byte) {
	if state == nil || state.env == nil {
		return
	}

	slot, ok := callbackSlotForEventKind(kind)
	if !ok {
		return
	}

	callbackRef := state.callbacks[slot]
	if callbackRef == nil {
		return
	}

	eventValue, ok := createEventValue(state.env, kind, payload)
	if !ok {
		return
	}

	callbackValue, ok := getReferenceValue(state.env, callbackRef)
	if !ok {
		return
	}

	receiver := undefined(state.env)
	if receiver == nil {
		return
	}

	if !must(
		C.napi_call_function(state.env, receiver, callbackValue, 1, &eventValue, nil),
		state.env,
		"failed to call registered event callback",
	) {
		return
	}
}

func handleWriteEvent(ctx context.Context, module api.Module, kind uint32, payloadPtr uint32, payloadLen uint32) {
	state := harnessStateFromContext(ctx)
	if state == nil {
		return
	}

	memory := module.Memory()
	if memory == nil {
		return
	}

	payload, ok := memory.Read(payloadPtr, payloadLen)
	if !ok {
		return
	}

	sink := writeEventSinkFromContext(ctx)
	if sink != nil {
		sink.Handle(kind, payload)
		return
	}

	dispatchEventPayload(state, kind, payload)
}

func traceNativeWazero(format string, args ...any) {
	if os.Getenv("AS_HARNESS_TRACE_WAZERO") != "1" {
		return
	}

	_, _ = fmt.Fprintf(os.Stderr, "[wazero-native] "+format+"\n", args...)
}

func useInterpreterWazeroRuntime(engine string) bool {
	return engine == wazeroEngineInterpreter
}

func createWazeroRuntime(ctx context.Context, engine string) wazero.Runtime {
	if useInterpreterWazeroRuntime(engine) {
		traceNativeWazero("using interpreter runtime engine")
		return wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfigInterpreter())
	}

	traceNativeWazero("using default runtime engine")
	return wazero.NewRuntime(ctx)
}

func compileHarness(bytes []byte, engine string) (*harnessState, error) {
	ctx := context.Background()
	traceNativeWazero("compileHarness bytes=%d engine=%q", len(bytes), engine)
	runtime := createWazeroRuntime(ctx, engine)

	_, err := runtime.NewHostModuleBuilder(abortModuleName).
		NewFunctionBuilder().
		WithFunc(func(context.Context, uint32, uint32, uint32, uint32) {}).
		Export("abort").
		NewFunctionBuilder().
		WithFunc(func(ctx context.Context, module api.Module, messagePtr uint32, valueCount int32, a0 float64, a1 float64, a2 float64, a3 float64, a4 float64) {
			state := harnessStateFromContext(ctx)
			if state == nil {
				return
			}

			memory := module.Memory()
			if memory == nil {
				return
			}

			message, ok := readAssemblyString(memory, messagePtr)
			if !ok {
				return
			}

			values := []float64{a0, a1, a2, a3, a4}
			clampedValueCount := valueCount
			if clampedValueCount < 0 {
				clampedValueCount = 0
			}
			if clampedValueCount > int32(len(values)) {
				clampedValueCount = int32(len(values))
			}

			payload := encodeLogPayload(message, values[:clampedValueCount])
			sink := writeEventSinkFromContext(ctx)
			if sink != nil {
				sink.Handle(eventKindLog, payload)
				return
			}

			dispatchEventPayload(state, eventKindLog, payload)
		}).
		Export("trace").
		Instantiate(ctx)
	if err != nil {
		_ = runtime.Close(ctx)
		return nil, err
	}
	traceNativeWazero("instantiated abort host module")

	writeEventBuilder := runtime.NewHostModuleBuilder(writeEventModuleName)
	writeEventBuilder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, module api.Module, kind uint32, payloadPtr uint32, payloadLen uint32) {
			handleWriteEvent(ctx, module, kind, payloadPtr, payloadLen)
		}).
		Export("write_event")
	writeEventBuilder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, module api.Module) uint32 {
			invoke := module.ExportedFunction(invokeExport)
			if invoke == nil {
				return 0
			}

			if _, err := invoke.Call(ctx); err != nil {
				return 0
			}

			return 1
		}).
		Export(invokeStagedImport)

	_, err = writeEventBuilder.Instantiate(ctx)
	if err != nil {
		_ = runtime.Close(ctx)
		return nil, err
	}
	traceNativeWazero("instantiated write_event host module")

	_, err = runtime.NewHostModuleBuilder(coversModuleName).
		NewFunctionBuilder().
		WithFunc(func(ctx context.Context, module api.Module, filePtr uint32, id uint32, line int32, column int32, coverType uint32) {
			collector := coverageCollectorFromContext(ctx)
			if collector == nil {
				return
			}

			memory := module.Memory()
			if memory == nil {
				return
			}

			file, ok := readAssemblyString(memory, filePtr)
			if !ok {
				return
			}

			collector.Declare(coveragePoint{
				ID:        id,
				File:      file,
				Line:      line,
				Column:    column,
				CoverType: coverType,
			})
		}).
		Export("coverDeclare").
		NewFunctionBuilder().
		WithFunc(func(ctx context.Context, id uint32) {
			collector := coverageCollectorFromContext(ctx)
			if collector == nil {
				return
			}

			collector.Hit(id)
		}).
		Export("cover").
		Instantiate(ctx)
	if err != nil {
		_ = runtime.Close(ctx)
		return nil, err
	}
	traceNativeWazero("instantiated coverage host module")

	compiled, err := runtime.CompileModule(ctx, bytes)
	if err != nil {
		_ = runtime.Close(ctx)
		return nil, err
	}
	traceNativeWazero("compiled module")

	return &harnessState{
		runtime:  runtime,
		compiled: compiled,
		coverage: newCoverageCollector(),
	}, nil
}

func storeHarness(state *harnessState) int64 {
	harnessMu.Lock()
	defer harnessMu.Unlock()

	id := nextHarnessID
	nextHarnessID++
	harnesses[id] = state
	return id
}

func getHarness(id int64) *harnessState {
	harnessMu.Lock()
	defer harnessMu.Unlock()

	return harnesses[id]
}

func deleteHarness(id int64, env C.node_api_basic_env) {
	harnessMu.Lock()
	state := harnesses[id]
	delete(harnesses, id)
	harnessMu.Unlock()

	if state == nil {
		return
	}

	for index, callback := range state.callbacks {
		if callback == nil {
			continue
		}

		C.napi_delete_reference(env, callback)
		state.callbacks[index] = nil
	}

	if state.compiled != nil {
		_ = state.compiled.Close(context.Background())
		state.compiled = nil
	}

	if state.runtime != nil {
		_ = state.runtime.Close(context.Background())
		state.runtime = nil
	}
}

func getHarnessID(env C.napi_env, harness C.napi_value) (int64, bool) {
	cName := C.CString(harnessIDProperty)
	defer C.free(unsafe.Pointer(cName))

	var idValue C.napi_value
	if !must(C.napi_get_named_property(env, harness, cName, &idValue), env, "failed to read harness id") {
		return 0, false
	}

	var id C.int64_t
	if !must(C.napi_get_value_int64(env, idValue, &id), env, "failed to decode harness id") {
		return 0, false
	}

	return int64(id), true
}

func requireHarness(env C.napi_env, harness C.napi_value) (*harnessState, bool) {
	id, ok := getHarnessID(env, harness)
	if !ok {
		return nil, false
	}

	state := getHarness(id)
	if state == nil {
		return nil, throwTypeError(env, "harness instance has already been released")
	}

	return state, true
}

func registerCallback(env C.napi_env, info C.napi_callback_info, slot callbackSlot) C.napi_value {
	args, thisArg, ok := getCallbackArguments(env, info, 1)
	if !ok {
		return nil
	}

	if len(args) < 1 {
		throwTypeError(env, "expected a callback function")
		return nil
	}

	var valueType C.napi_valuetype
	if !must(C.napi_typeof(env, args[0], &valueType), env, "failed to read callback type") {
		return nil
	}

	if valueType != C.napi_function {
		throwTypeError(env, "expected a callback function")
		return nil
	}

	state, ok := requireHarness(env, thisArg)
	if !ok {
		return nil
	}

	if state.callbacks[slot] != nil {
		C.napi_delete_reference(C.node_api_basic_env(env), state.callbacks[slot])
		state.callbacks[slot] = nil
	}

	var ref C.napi_ref
	if !must(C.napi_create_reference(env, args[0], 1, &ref), env, "failed to retain callback") {
		return nil
	}

	state.callbacks[slot] = ref
	return undefined(env)
}

func createHarnessObject(env C.napi_env, id int64) C.napi_value {
	var harness C.napi_value
	if !must(C.napi_create_object(env, &harness), env, "failed to create harness object") {
		return nil
	}

	if !setNamedProperty(env, harness, harnessIDProperty, createInt64(env, id)) {
		return nil
	}

	finalizerData := C.malloc(C.size_t(unsafe.Sizeof(C.uint64_t(0))))
	if finalizerData == nil {
		message := C.CString("failed to allocate finalizer state")
		defer C.free(unsafe.Pointer(message))

		C.napi_throw_error(env, nil, message)
		return nil
	}

	*(*C.uint64_t)(finalizerData) = C.uint64_t(id)
	if !must(
		C.napi_add_finalizer(
			env,
			harness,
			finalizerData,
			(C.node_api_basic_finalize)(C.GoFinalizeHarness),
			nil,
			nil,
		),
		env,
		"failed to attach harness finalizer",
	) {
		C.free(finalizerData)
		return nil
	}

	if !setNamedProperty(env, harness, "onNodeFound", createFunction(env, "onNodeFound", (C.napi_callback)(C.GoOnNodeFound))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onNodeStart", createFunction(env, "onNodeStart", (C.napi_callback)(C.GoOnNodeStart))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onNodePass", createFunction(env, "onNodePass", (C.napi_callback)(C.GoOnNodePass))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onNodeFail", createFunction(env, "onNodeFail", (C.napi_callback)(C.GoOnNodeFail))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onFailMessage", createFunction(env, "onFailMessage", (C.napi_callback)(C.GoOnFailMessage))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onCallbackStart", createFunction(env, "onCallbackStart", (C.napi_callback)(C.GoOnCallbackStart))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onCallbackPass", createFunction(env, "onCallbackPass", (C.napi_callback)(C.GoOnCallbackPass))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onCallbackFail", createFunction(env, "onCallbackFail", (C.napi_callback)(C.GoOnCallbackFail))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onDiagnostic", createFunction(env, "onDiagnostic", (C.napi_callback)(C.GoOnDiagnostic))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onLog", createFunction(env, "onLog", (C.napi_callback)(C.GoOnLog))) {
		return nil
	}
	if !setNamedProperty(env, harness, "callI32", createFunction(env, "callI32", (C.napi_callback)(C.GoCallI32))) {
		return nil
	}
	if !setNamedProperty(env, harness, "discover", createFunction(env, "discover", (C.napi_callback)(C.GoDiscoverHarness))) {
		return nil
	}
	if !setNamedProperty(env, harness, "run", createFunction(env, "run", (C.napi_callback)(C.GoRunHarness))) {
		return nil
	}
	if !setNamedProperty(env, harness, "start", createFunction(env, "start", (C.napi_callback)(C.GoStartHarness))) {
		return nil
	}
	if !setNamedProperty(env, harness, "getCoverageSnapshot", createFunction(env, "getCoverageSnapshot", (C.napi_callback)(C.GoGetCoverageSnapshot))) {
		return nil
	}
	if !setNamedProperty(env, harness, "resetCoverage", createFunction(env, "resetCoverage", (C.napi_callback)(C.GoResetCoverage))) {
		return nil
	}
	if !setNamedProperty(env, harness, "close", createFunction(env, "close", (C.napi_callback)(C.GoCloseHarness))) {
		return nil
	}

	return harness
}

//export GoCreateHarness
func GoCreateHarness(env C.napi_env, info C.napi_callback_info) C.napi_value {
	args, _, ok := getCallbackArguments(env, info, 2)
	if !ok {
		return nil
	}

	if len(args) < 1 {
		throwTypeError(env, "createHarness expects wasm bytes")
		return nil
	}

	wasmBytes, ok := bytesFromValue(env, args[0])
	if !ok {
		return nil
	}

	engine := ""
	if len(args) > 1 {
		engine, ok = stringFromValue(env, args[1])
		if !ok {
			throwTypeError(env, "createHarness engine override must be a string")
			return nil
		}
	}

	traceNativeWazero("GoCreateHarness invoked")
	state, err := compileHarness(wasmBytes, engine)
	if err != nil {
		throwError(env, err.Error())
		return nil
	}
	traceNativeWazero("GoCreateHarness finished")

	state.env = env

	return createHarnessObject(env, storeHarness(state))
}

func nodeIndexFromValue(env C.napi_env, value C.napi_value) ([]uint32, bool) {
	var isArray C.bool
	if C.napi_is_array(env, value, &isArray) != C.napi_ok || !isArray {
		return nil, false
	}

	var length C.uint32_t
	if C.napi_get_array_length(env, value, &length) != C.napi_ok {
		return nil, false
	}

	nodeIndex := make([]uint32, int(length))
	for index := C.uint32_t(0); index < length; index++ {
		var element C.napi_value
		if C.napi_get_element(env, value, index, &element) != C.napi_ok {
			return nil, false
		}

		var value C.uint32_t
		if C.napi_get_value_uint32(env, element, &value) != C.napi_ok {
			return nil, false
		}

		nodeIndex[int(index)] = uint32(value)
	}

	return nodeIndex, true
}

func countTestNodes(nodes []nodeSnapshot) uint32 {
	var count uint32
	for _, node := range nodes {
		if node.Kind == nodeKindTest {
			count += 1
		}
	}

	return count
}

func listRunnableTests(nodes []nodeSnapshot) []nodeSnapshot {
	runnable := make([]nodeSnapshot, 0, len(nodes))
	for _, node := range nodes {
		if node.Kind == nodeKindTest && node.DeclarationMode == declarationModeNormal {
			runnable = append(runnable, node)
		}
	}

	return runnable
}

func getWorkerCount(branchCount int) int {
	if branchCount == 0 {
		return 0
	}

	count := goruntime.NumCPU()
	if count < 1 {
		count = 1
	}
	if count > branchCount {
		count = branchCount
	}

	return count
}

func discoverImmediateChildren(state *harnessState, nodeIndex []uint32, coverage *coverageCollector) immediateDiscoverySnapshot {
	collector := &nodeCollector{}
	ok := discoverNodeIndexWithSink(context.Background(), state, nodeIndex, collector, coverage)
	nodes := collector.nodes[:0]
	for _, node := range collector.nodes {
		if equalNodeIndex(node.NodeIndex, nodeIndex) {
			continue
		}
		nodes = append(nodes, node)
	}
	return immediateDiscoverySnapshot{
		OK:    ok,
		Nodes: nodes,
	}
}

func discoverBranch(state *harnessState, rootNode nodeSnapshot, coverage *coverageCollector) discoverySnapshot {
	nodes := []nodeSnapshot{rootNode}
	queue := []nodeSnapshot{rootNode}
	ok := true

	for len(queue) > 0 {
		parent := queue[0]
		queue = queue[1:]

		discovered := discoverImmediateChildren(state, parent.NodeIndex, coverage)
		if !discovered.OK {
			if parent.Kind == nodeKindTest {
				continue
			}

			ok = false
			break
		}

		for _, child := range discovered.Nodes {
			nodes = append(nodes, child)
			queue = append(queue, child)
		}
	}

	return discoverySnapshot{
		OK:        ok,
		Nodes:     nodes,
		TestCount: countTestNodes(nodes),
	}
}

func runBranchExecutions(state *harnessState, runTargets []nodeSnapshot, coverage *coverageCollector) []executionSnapshot {
	executions := make([]executionSnapshot, 0, len(runTargets))
	for _, node := range runTargets {
		collector := &eventCollector{}
		ok := runNodeIndexWithSink(context.Background(), state, node.NodeIndex, collector, coverage)
		executions = append(executions, executionSnapshot{
			Node:   node,
			OK:     ok,
			Events: collector.events,
		})
	}

	return executions
}

func startHarness(state *harnessState) startSnapshot {
	coverage := newCoverageCollector()
	topLevelDiscovery := discoverImmediateChildren(state, []uint32{}, coverage)
	topLevelNodes := topLevelDiscovery.Nodes
	branches := make([]branchSnapshot, len(topLevelNodes))
	for index, root := range topLevelNodes {
		branches[index] = branchSnapshot{
			Root:       root,
			Discovery:  discoverySnapshot{OK: false, Nodes: []nodeSnapshot{}, TestCount: 0},
			Executions: []executionSnapshot{},
			OK:         false,
		}
	}

	for index, root := range topLevelNodes {
		branches[index].Discovery = discoverBranch(state, root, coverage)
	}

	discoveryOK := topLevelDiscovery.OK
	for index := range branches {
		if !branches[index].Discovery.OK {
			discoveryOK = false
		}
	}

	workerCount := 0
	if discoveryOK {
		workerCount = min(1, len(branches))
	}

	for index := range branches {
		branches[index].Executions = runBranchExecutions(state, listRunnableTests(branches[index].Discovery.Nodes), coverage)
	}

	result := startSnapshot{
		OK:                  discoveryOK,
		DiscoveryOK:         discoveryOK,
		DiscoveredTestCount: 0,
		TopLevelNodes:       topLevelNodes,
		WorkerCount:         uint32(workerCount),
		Branches:            branches,
		Coverage:            coverage.Snapshot(),
	}

	for index := range result.Branches {
		branch := &result.Branches[index]
		result.DiscoveredTestCount += branch.Discovery.TestCount
		branch.OK = branch.Discovery.OK
		for _, execution := range branch.Executions {
			if !execution.OK {
				branch.OK = false
				break
			}
		}
		if !branch.OK {
			result.OK = false
		}
	}

	return result
}

func equalNodeIndex(left []uint32, right []uint32) bool {
	if len(left) != len(right) {
		return false
	}

	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}

	return true
}

func createNodeSnapshotValue(env C.napi_env, node nodeSnapshot) (C.napi_value, bool) {
	result, ok := createNodeEventObject(env, node.NodeIndex, node.NodeID)
	if !ok {
		return nil, false
	}
	if !setNamedProperty(env, result, "parentNodeId", createUint32(env, node.ParentNodeID)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "declarationOrder", createUint32(env, node.DeclarationOrder)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "sequenceMode", createUint32(env, node.SequenceMode)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "preferredRunnerMode", createUint32(env, node.PreferredRunnerMode)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "preferredFailurePolicy", createUint32(env, node.PreferredFailurePolicy)) {
		return nil, false
	}
	dependencyNodeIDsValue, ok := createUint32SliceValue(env, node.DependencyNodeIDs)
	if !ok {
		return nil, false
	}
	if !setNamedProperty(env, result, "dependencyNodeIds", dependencyNodeIDsValue) {
		return nil, false
	}
	if !setNamedProperty(env, result, "only", createBoolean(env, node.Only)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "expectFailure", createBoolean(env, node.ExpectFailure)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "kind", createUint32(env, node.Kind)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "declarationMode", createUint32(env, node.DeclarationMode)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "name", createString(env, node.Name)) {
		return nil, false
	}

	return result, true
}

func createEventSnapshotValue(env C.napi_env, event eventSnapshot) (C.napi_value, bool) {
	result := createObject(env, "failed to create event snapshot")
	if result == nil {
		return nil, false
	}

	if !setNamedProperty(env, result, "type", createString(env, event.Type)) {
		return nil, false
	}

	var data C.napi_value
	switch event.Type {
	case "nodeFound":
		var ok bool
		data, ok = createNodeSnapshotValue(env, nodeSnapshot{
			NodeIndex:              event.NodeIndex,
			NodeID:                 event.NodeID,
			ParentNodeID:           event.ParentNodeID,
			DeclarationOrder:       event.DeclarationOrder,
			SequenceMode:           event.SequenceMode,
			PreferredRunnerMode:    event.PreferredRunnerMode,
			PreferredFailurePolicy: event.PreferredFailurePolicy,
			DependencyNodeIDs:      event.DependencyNodeIDs,
			Only:                   event.Only,
			ExpectFailure:          event.ExpectFailure,
			Kind:                   event.Kind,
			DeclarationMode:        event.DeclarationMode,
			Name:                   event.Name,
		})
		if !ok {
			return nil, false
		}
	case "nodeStart", "nodePass":
		var ok bool
		data, ok = createNodeEventObject(env, event.NodeIndex, event.NodeID)
		if !ok {
			return nil, false
		}
	case "nodeFail":
		var ok bool
		data, ok = createNodeEventObject(env, event.NodeIndex, event.NodeID)
		if !ok {
			return nil, false
		}
		if !setNamedProperty(env, data, "failureKind", createUint32(env, event.FailureKind)) {
			return nil, false
		}
	case "callbackStart", "callbackPass":
		var ok bool
		data, ok = createNodeEventObject(env, event.NodeIndex, event.NodeID)
		if !ok {
			return nil, false
		}
		if !setNamedProperty(env, data, "hook", createUint32(env, event.Hook)) {
			return nil, false
		}
	case "callbackFail":
		var ok bool
		data, ok = createNodeEventObject(env, event.NodeIndex, event.NodeID)
		if !ok {
			return nil, false
		}
		if !setNamedProperty(env, data, "hook", createUint32(env, event.Hook)) {
			return nil, false
		}
		if !setNamedProperty(env, data, "failureKind", createUint32(env, event.FailureKind)) {
			return nil, false
		}
	case "failMessage":
		data = createObject(env, "failed to create event data")
		if data == nil {
			return nil, false
		}
		if !setNamedProperty(env, data, "message", createString(env, event.Message)) {
			return nil, false
		}
	case "diagnostic":
		var ok bool
		data, ok = createDiagnosticEventObject(env, event.NodeIndex, event.Message)
		if !ok {
			return nil, false
		}
	case "log":
		data = createObject(env, "failed to create event data")
		if data == nil {
			return nil, false
		}
		if !setNamedProperty(env, data, "message", createString(env, event.Message)) {
			return nil, false
		}
		if !setNamedProperty(env, data, "source", createString(env, "trace")) {
			return nil, false
		}
		valuesValue := createArrayWithLength(env, uint32(len(event.Values)))
		if valuesValue == nil {
			return nil, false
		}
		for index, value := range event.Values {
			if !setElement(env, valuesValue, uint32(index), createDouble(env, value)) {
				return nil, false
			}
		}
		if !setNamedProperty(env, data, "values", valuesValue) {
			return nil, false
		}
	default:
		return nil, false
	}

	if !setNamedProperty(env, result, "data", data) {
		return nil, false
	}

	return result, true
}

func createExecutionSnapshotValue(env C.napi_env, execution executionSnapshot) (C.napi_value, bool) {
	result := createObject(env, "failed to create execution snapshot")
	if result == nil {
		return nil, false
	}

	nodeValue, ok := createNodeSnapshotValue(env, execution.Node)
	if !ok {
		return nil, false
	}
	if !setNamedProperty(env, result, "node", nodeValue) {
		return nil, false
	}
	if !setNamedProperty(env, result, "ok", createBoolean(env, execution.OK)) {
		return nil, false
	}

	eventsValue := createArrayWithLength(env, uint32(len(execution.Events)))
	if eventsValue == nil {
		return nil, false
	}
	for index, event := range execution.Events {
		eventValue, ok := createEventSnapshotValue(env, event)
		if !ok {
			return nil, false
		}
		if !setElement(env, eventsValue, uint32(index), eventValue) {
			return nil, false
		}
	}
	if !setNamedProperty(env, result, "events", eventsValue) {
		return nil, false
	}

	return result, true
}

func createDiscoverySnapshotValue(env C.napi_env, discovery discoverySnapshot) (C.napi_value, bool) {
	result := createObject(env, "failed to create discovery snapshot")
	if result == nil {
		return nil, false
	}

	if !setNamedProperty(env, result, "ok", createBoolean(env, discovery.OK)) {
		return nil, false
	}

	nodesValue := createArrayWithLength(env, uint32(len(discovery.Nodes)))
	if nodesValue == nil {
		return nil, false
	}
	for index, node := range discovery.Nodes {
		nodeValue, ok := createNodeSnapshotValue(env, node)
		if !ok {
			return nil, false
		}
		if !setElement(env, nodesValue, uint32(index), nodeValue) {
			return nil, false
		}
	}
	if !setNamedProperty(env, result, "nodes", nodesValue) {
		return nil, false
	}
	if !setNamedProperty(env, result, "testCount", createUint32(env, discovery.TestCount)) {
		return nil, false
	}

	return result, true
}

func createBranchSnapshotValue(env C.napi_env, branch branchSnapshot) (C.napi_value, bool) {
	result := createObject(env, "failed to create branch snapshot")
	if result == nil {
		return nil, false
	}

	rootValue, ok := createNodeSnapshotValue(env, branch.Root)
	if !ok {
		return nil, false
	}
	if !setNamedProperty(env, result, "root", rootValue) {
		return nil, false
	}

	discoveryValue, ok := createDiscoverySnapshotValue(env, branch.Discovery)
	if !ok {
		return nil, false
	}
	if !setNamedProperty(env, result, "discovery", discoveryValue) {
		return nil, false
	}

	executionsValue := createArrayWithLength(env, uint32(len(branch.Executions)))
	if executionsValue == nil {
		return nil, false
	}
	for index, execution := range branch.Executions {
		executionValue, ok := createExecutionSnapshotValue(env, execution)
		if !ok {
			return nil, false
		}
		if !setElement(env, executionsValue, uint32(index), executionValue) {
			return nil, false
		}
	}
	if !setNamedProperty(env, result, "executions", executionsValue) {
		return nil, false
	}
	if !setNamedProperty(env, result, "ok", createBoolean(env, branch.OK)) {
		return nil, false
	}

	return result, true
}

func createStartSnapshotValue(env C.napi_env, result startSnapshot) (C.napi_value, bool) {
	value := createObject(env, "failed to create start snapshot")
	if value == nil {
		return nil, false
	}

	if !setNamedProperty(env, value, "ok", createBoolean(env, result.OK)) {
		return nil, false
	}
	if !setNamedProperty(env, value, "discoveryOk", createBoolean(env, result.DiscoveryOK)) {
		return nil, false
	}
	if !setNamedProperty(env, value, "discoveredTestCount", createUint32(env, result.DiscoveredTestCount)) {
		return nil, false
	}

	topLevelNodesValue := createArrayWithLength(env, uint32(len(result.TopLevelNodes)))
	if topLevelNodesValue == nil {
		return nil, false
	}
	for index, node := range result.TopLevelNodes {
		nodeValue, ok := createNodeSnapshotValue(env, node)
		if !ok {
			return nil, false
		}
		if !setElement(env, topLevelNodesValue, uint32(index), nodeValue) {
			return nil, false
		}
	}
	if !setNamedProperty(env, value, "topLevelNodes", topLevelNodesValue) {
		return nil, false
	}
	if !setNamedProperty(env, value, "workerCount", createUint32(env, result.WorkerCount)) {
		return nil, false
	}

	branchesValue := createArrayWithLength(env, uint32(len(result.Branches)))
	if branchesValue == nil {
		return nil, false
	}
	for index, branch := range result.Branches {
		branchValue, ok := createBranchSnapshotValue(env, branch)
		if !ok {
			return nil, false
		}
		if !setElement(env, branchesValue, uint32(index), branchValue) {
			return nil, false
		}
	}
	if !setNamedProperty(env, value, "branches", branchesValue) {
		return nil, false
	}
	if result.Coverage != nil {
		coverageValue, ok := createCoverageSnapshotValue(env, *result.Coverage)
		if !ok {
			return nil, false
		}
		if !setNamedProperty(env, value, "coverage", coverageValue) {
			return nil, false
		}
	}

	return value, true
}

func createCoverageSnapshotValue(env C.napi_env, snapshot coverageSnapshot) (C.napi_value, bool) {
	value := createObject(env, "failed to create coverage snapshot")
	if value == nil {
		return nil, false
	}

	pointsValue := createArrayWithLength(env, uint32(len(snapshot.Points)))
	if pointsValue == nil {
		return nil, false
	}
	for index, point := range snapshot.Points {
		pointValue := createObject(env, "failed to create coverage point")
		if pointValue == nil {
			return nil, false
		}
		if !setNamedProperty(env, pointValue, "id", createUint32(env, point.ID)) {
			return nil, false
		}
		if !setNamedProperty(env, pointValue, "file", createString(env, point.File)) {
			return nil, false
		}
		if !setNamedProperty(env, pointValue, "line", createInt64(env, int64(point.Line))) {
			return nil, false
		}
		if !setNamedProperty(env, pointValue, "column", createInt64(env, int64(point.Column))) {
			return nil, false
		}
		if !setNamedProperty(env, pointValue, "coverType", createUint32(env, point.CoverType)) {
			return nil, false
		}
		if !setElement(env, pointsValue, uint32(index), pointValue) {
			return nil, false
		}
	}
	if !setNamedProperty(env, value, "points", pointsValue) {
		return nil, false
	}

	coveredValue := createArrayWithLength(env, uint32(len(snapshot.CoveredIDs)))
	if coveredValue == nil {
		return nil, false
	}
	for index, id := range snapshot.CoveredIDs {
		if !setElement(env, coveredValue, uint32(index), createUint32(env, id)) {
			return nil, false
		}
	}
	if !setNamedProperty(env, value, "coveredIds", coveredValue) {
		return nil, false
	}

	return value, true
}

func runNodeIndex(ctx context.Context, state *harnessState, nodeIndex []uint32) bool {
	return runNodeIndexWithSink(ctx, state, nodeIndex, nil, state.coverage)
}

func runNodeIndexWithSink(ctx context.Context, state *harnessState, nodeIndex []uint32, sink writeEventSink, coverage *coverageCollector) bool {
	ctx = contextWithCoverageCollector(ctx, state, sink, coverage)

	module, err := state.runtime.InstantiateModule(
		ctx,
		state.compiled,
		wazero.NewModuleConfig().WithName("").WithStartFunctions("__start"),
	)
	if err != nil {
		return false
	}
	defer module.Close(ctx)

	allocateBuffer := module.ExportedFunction(allocateNodeIndexBufferExport)
	if allocateBuffer == nil {
		return false
	}

	results, err := allocateBuffer.Call(ctx, uint64(len(nodeIndex)))
	if err != nil || len(results) != 1 {
		return false
	}

	memory := module.Memory()
	if memory == nil {
		return false
	}

	bufferPtr := uint32(results[0])
	for index, value := range nodeIndex {
		offset := bufferPtr + uint32(index*uint32ByteLength)
		if !memory.WriteUint32Le(offset, value) {
			return false
		}
	}

	run := module.ExportedFunction(runExport)
	if run == nil {
		return false
	}

	runResults, err := run.Call(ctx)
	if err != nil || len(runResults) != 1 {
		return false
	}

	return runResults[0] == 1
}

func discoverNodeIndex(ctx context.Context, state *harnessState, nodeIndex []uint32) bool {
	return discoverNodeIndexWithSink(ctx, state, nodeIndex, nil, state.coverage)
}

func discoverNodeIndexWithSink(ctx context.Context, state *harnessState, nodeIndex []uint32, sink writeEventSink, coverage *coverageCollector) bool {
	ctx = contextWithCoverageCollector(ctx, state, sink, coverage)

	module, err := state.runtime.InstantiateModule(
		ctx,
		state.compiled,
		wazero.NewModuleConfig().WithName("").WithStartFunctions("__start"),
	)
	if err != nil {
		return false
	}
	defer module.Close(ctx)

	allocateBuffer := module.ExportedFunction(allocateNodeIndexBufferExport)
	if allocateBuffer == nil {
		return false
	}

	results, err := allocateBuffer.Call(ctx, uint64(len(nodeIndex)))
	if err != nil || len(results) != 1 {
		return false
	}

	memory := module.Memory()
	if memory == nil {
		return false
	}

	bufferPtr := uint32(results[0])
	for index, value := range nodeIndex {
		offset := bufferPtr + uint32(index*uint32ByteLength)
		if !memory.WriteUint32Le(offset, value) {
			return false
		}
	}

	discover := module.ExportedFunction(discoverExport)
	if discover == nil {
		return false
	}

	discoverResults, err := discover.Call(ctx)
	if err != nil || len(discoverResults) != 1 {
		return false
	}

	return int32(discoverResults[0]) >= 0
}

func callExportI32(ctx context.Context, state *harnessState, exportName string) (uint32, bool) {
	ctx = contextWithHarnessState(ctx, state)

	module, err := state.runtime.InstantiateModule(
		ctx,
		state.compiled,
		wazero.NewModuleConfig().WithName("").WithStartFunctions("__start"),
	)
	if err != nil {
		return 0, false
	}
	defer module.Close(ctx)

	exported := module.ExportedFunction(exportName)
	if exported == nil {
		return 0, false
	}

	results, err := exported.Call(ctx)
	if err != nil || len(results) != 1 {
		return 0, false
	}

	return uint32(results[0]), true
}

//export GoOnNodeFound
func GoOnNodeFound(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, nodeFoundSlot)
}

//export GoOnNodeStart
func GoOnNodeStart(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, nodeStartSlot)
}

//export GoOnNodePass
func GoOnNodePass(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, nodePassSlot)
}

//export GoOnNodeFail
func GoOnNodeFail(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, nodeFailSlot)
}

//export GoOnFailMessage
func GoOnFailMessage(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, failMessageSlot)
}

//export GoOnCallbackStart
func GoOnCallbackStart(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, callbackStartSlot)
}

//export GoOnCallbackPass
func GoOnCallbackPass(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, callbackPassSlot)
}

//export GoOnCallbackFail
func GoOnCallbackFail(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, callbackFailSlot)
}

//export GoOnDiagnostic
func GoOnDiagnostic(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, diagnosticSlot)
}

//export GoOnLog
func GoOnLog(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return registerCallback(env, info, logSlot)
}

//export GoCallI32
func GoCallI32(env C.napi_env, info C.napi_callback_info) C.napi_value {
	args, thisArg, ok := getCallbackArguments(env, info, 1)
	if !ok {
		return nil
	}

	if len(args) < 1 {
		throwTypeError(env, "expected an export name")
		return nil
	}

	state, ok := requireHarness(env, thisArg)
	if !ok {
		return nil
	}

	exportName, ok := stringFromValue(env, args[0])
	if !ok {
		throwTypeError(env, "expected an export name")
		return nil
	}

	result, ok := callExportI32(context.Background(), state, exportName)
	if !ok {
		throwError(env, "failed to call zero-argument i32 export")
		return nil
	}

	return createUint32(env, result)
}

//export GoDiscoverHarness
func GoDiscoverHarness(env C.napi_env, info C.napi_callback_info) C.napi_value {
	args, thisArg, ok := getCallbackArguments(env, info, 1)
	if !ok {
		return nil
	}

	if len(args) < 1 {
		return createBoolean(env, false)
	}

	state, ok := requireHarness(env, thisArg)
	if !ok {
		return createBoolean(env, false)
	}

	nodeIndex, ok := nodeIndexFromValue(env, args[0])
	if !ok {
		return createBoolean(env, false)
	}

	return createBoolean(env, discoverNodeIndex(context.Background(), state, nodeIndex))
}

//export GoRunHarness
func GoRunHarness(env C.napi_env, info C.napi_callback_info) C.napi_value {
	args, thisArg, ok := getCallbackArguments(env, info, 1)
	if !ok {
		return nil
	}

	if len(args) < 1 {
		return createBoolean(env, false)
	}

	state, ok := requireHarness(env, thisArg)
	if !ok {
		return createBoolean(env, false)
	}

	nodeIndex, ok := nodeIndexFromValue(env, args[0])
	if !ok {
		return createBoolean(env, false)
	}

	return createBoolean(env, runNodeIndex(context.Background(), state, nodeIndex))
}

//export GoStartHarness
func GoStartHarness(env C.napi_env, info C.napi_callback_info) C.napi_value {
	_, thisArg, ok := getCallbackArguments(env, info, 0)
	if !ok {
		return nil
	}

	state, ok := requireHarness(env, thisArg)
	if !ok {
		return nil
	}

	resultValue, ok := createStartSnapshotValue(env, startHarness(state))
	if !ok {
		return nil
	}

	return createResolvedPromise(env, resultValue)
}

//export GoGetCoverageSnapshot
func GoGetCoverageSnapshot(env C.napi_env, info C.napi_callback_info) C.napi_value {
	_, thisArg, ok := getCallbackArguments(env, info, 0)
	if !ok {
		return nil
	}

	state, ok := requireHarness(env, thisArg)
	if !ok {
		return nil
	}

	snapshot := state.coverage.Snapshot()
	if snapshot == nil {
		return null(env)
	}

	value, ok := createCoverageSnapshotValue(env, *snapshot)
	if !ok {
		return nil
	}

	return value
}

//export GoResetCoverage
func GoResetCoverage(env C.napi_env, info C.napi_callback_info) C.napi_value {
	_, thisArg, ok := getCallbackArguments(env, info, 0)
	if !ok {
		return nil
	}

	state, ok := requireHarness(env, thisArg)
	if !ok {
		return nil
	}

	state.coverage.Reset()
	return undefined(env)
}

//export GoCloseHarness
func GoCloseHarness(env C.napi_env, info C.napi_callback_info) C.napi_value {
	_, thisArg, ok := getCallbackArguments(env, info, 0)
	if !ok {
		return nil
	}

	id, ok := getHarnessID(env, thisArg)
	if !ok {
		return nil
	}

	deleteHarness(id, C.node_api_basic_env(env))
	return undefined(env)
}

//export GoFinalizeHarness
func GoFinalizeHarness(env C.node_api_basic_env, data unsafe.Pointer, hint unsafe.Pointer) {
	_ = hint

	if data == nil {
		return
	}

	id := int64(*(*C.uint64_t)(data))
	deleteHarness(id, env)
	C.free(data)
}

//export GoInit
func GoInit(env C.napi_env, exports C.napi_value) C.napi_value {
	if !setNamedProperty(env, exports, "createHarness", createFunction(env, "createHarness", (C.napi_callback)(C.GoCreateHarness))) {
		return nil
	}

	return exports
}
