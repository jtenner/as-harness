package main

/*
#include <stdint.h>
#include <stdlib.h>
#include <node_api.h>

extern napi_value GoCreateHarness(napi_env env, napi_callback_info info);
extern napi_value GoOnNodeFound(napi_env env, napi_callback_info info);
extern napi_value GoOnNodeStart(napi_env env, napi_callback_info info);
extern napi_value GoOnNodePass(napi_env env, napi_callback_info info);
extern napi_value GoOnFailMessage(napi_env env, napi_callback_info info);
extern napi_value GoOnCallbackStart(napi_env env, napi_callback_info info);
extern napi_value GoOnCallbackPass(napi_env env, napi_callback_info info);
extern napi_value GoCallI32(napi_env env, napi_callback_info info);
extern napi_value GoRunHarness(napi_env env, napi_callback_info info);
extern void GoFinalizeHarness(node_api_basic_env env, void* data, void* hint);
*/
import "C"

import (
	"context"
	"encoding/binary"
	"sync"
	"unsafe"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

const harnessIDProperty = "__asHarnessId"
const allocateNodeIndexBufferExport = "allocateNodeIndexBuffer"
const runExport = "run"
const abortModuleName = "env"
const writeEventModuleName = "as-harness"
const invokeExport = "invoke"
const invokeStagedImport = "invoke_staged"
const uint32ByteLength = 4
const eventKindNodeFound = 1
const eventKindNodeStart = 2
const eventKindNodePass = 3
const eventKindFailMessage = 4
const eventKindCallbackStart = 5
const eventKindCallbackPass = 6

type callbackSlot int

const (
	nodeFoundSlot callbackSlot = iota
	nodeStartSlot
	nodePassSlot
	failMessageSlot
	callbackStartSlot
	callbackPassSlot
	callbackSlotCount
)

type harnessState struct {
	runtime   wazero.Runtime
	compiled  wazero.CompiledModule
	env       C.napi_env
	callbacks [callbackSlotCount]C.napi_ref
}

type hostCallStateContextKey struct{}

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

func typedArrayByteLength(arrayType C.napi_typedarray_type, length C.size_t) C.size_t {
	switch arrayType {
	case C.napi_int8_array, C.napi_uint8_array, C.napi_uint8_clamped_array:
		return length
	case C.napi_int16_array, C.napi_uint16_array, C.napi_float16_array:
		return length * 2
	case C.napi_int32_array, C.napi_uint32_array, C.napi_float32_array:
		return length * 4
	case C.napi_float64_array, C.napi_bigint64_array, C.napi_biguint64_array:
		return length * 8
	default:
		return 0
	}
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

		return copyBytes(data, typedArrayByteLength(arrayType, length)), true
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
	return context.WithValue(ctx, hostCallStateContextKey{}, state)
}

func harnessStateFromContext(ctx context.Context) *harnessState {
	state, _ := ctx.Value(hostCallStateContextKey{}).(*harnessState)
	return state
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

func createNodeEventObject(env C.napi_env, nodeIndex []uint32) (C.napi_value, bool) {
	var result C.napi_value
	if !must(C.napi_create_object(env, &result), env, "failed to create event object") {
		return nil, false
	}

	nodeIndexValue, ok := createNodeIndexValue(env, nodeIndex)
	if !ok {
		return nil, false
	}

	if !setNamedProperty(env, result, "nodeIndex", nodeIndexValue) {
		return nil, false
	}

	return result, true
}

func createNodeFoundEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	nodeIndex, offset, ok := decodeNodeIndex(payload, 0)
	if !ok || offset+8 > len(payload) {
		return nil, false
	}

	result, ok := createNodeEventObject(env, nodeIndex)
	if !ok {
		return nil, false
	}

	kind := uint32(payload[offset])
	mode := uint32(payload[offset+1])
	nameLength, nextOffset, ok := decodeUint32(payload, offset+4)
	if !ok {
		return nil, false
	}
	if nextOffset+int(nameLength) > len(payload) {
		return nil, false
	}

	if !setNamedProperty(env, result, "kind", createUint32(env, kind)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "declarationMode", createUint32(env, mode)) {
		return nil, false
	}
	if !setNamedProperty(env, result, "name", createString(env, string(payload[nextOffset:nextOffset+int(nameLength)]))) {
		return nil, false
	}

	return result, true
}

func createCallbackEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	if len(payload) < 8 {
		return nil, false
	}

	hook := uint32(payload[0])
	nodeIndex, _, ok := decodeNodeIndex(payload, 4)
	if !ok {
		return nil, false
	}

	result, ok := createNodeEventObject(env, nodeIndex)
	if !ok {
		return nil, false
	}

	if !setNamedProperty(env, result, "hook", createUint32(env, hook)) {
		return nil, false
	}

	return result, true
}

func createFailMessageEvent(env C.napi_env, payload []byte) (C.napi_value, bool) {
	var result C.napi_value
	if !must(C.napi_create_object(env, &result), env, "failed to create event object") {
		return nil, false
	}

	if !setNamedProperty(env, result, "message", createString(env, string(payload))) {
		return nil, false
	}

	return result, true
}

func createEventValue(env C.napi_env, kind uint32, payload []byte) (C.napi_value, bool) {
	switch kind {
	case eventKindNodeFound:
		return createNodeFoundEvent(env, payload)
	case eventKindNodeStart, eventKindNodePass:
		nodeIndex, _, ok := decodeNodeIndex(payload, 0)
		if !ok {
			return nil, false
		}
		return createNodeEventObject(env, nodeIndex)
	case eventKindFailMessage:
		return createFailMessageEvent(env, payload)
	case eventKindCallbackStart, eventKindCallbackPass:
		return createCallbackEvent(env, payload)
	default:
		return nil, false
	}
}

func callbackSlotForEventKind(kind uint32) (callbackSlot, bool) {
	switch kind {
	case eventKindNodeFound:
		return nodeFoundSlot, true
	case eventKindNodeStart:
		return nodeStartSlot, true
	case eventKindNodePass:
		return nodePassSlot, true
	case eventKindFailMessage:
		return failMessageSlot, true
	case eventKindCallbackStart:
		return callbackStartSlot, true
	case eventKindCallbackPass:
		return callbackPassSlot, true
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

	dispatchEventPayload(state, kind, payload)
}

func compileHarness(bytes []byte) (*harnessState, error) {
	ctx := context.Background()
	runtime := wazero.NewRuntime(ctx)

	_, err := runtime.NewHostModuleBuilder(abortModuleName).
		NewFunctionBuilder().
		WithFunc(func(context.Context, uint32, uint32, uint32, uint32) {}).
		Export("abort").
		Instantiate(ctx)
	if err != nil {
		_ = runtime.Close(ctx)
		return nil, err
	}

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

	compiled, err := runtime.CompileModule(ctx, bytes)
	if err != nil {
		_ = runtime.Close(ctx)
		return nil, err
	}

	return &harnessState{
		runtime:  runtime,
		compiled: compiled,
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

	if state.runtime != nil {
		_ = state.runtime.Close(context.Background())
		state.runtime = nil
		state.compiled = nil
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
	if !setNamedProperty(env, harness, "onFailMessage", createFunction(env, "onFailMessage", (C.napi_callback)(C.GoOnFailMessage))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onCallbackStart", createFunction(env, "onCallbackStart", (C.napi_callback)(C.GoOnCallbackStart))) {
		return nil
	}
	if !setNamedProperty(env, harness, "onCallbackPass", createFunction(env, "onCallbackPass", (C.napi_callback)(C.GoOnCallbackPass))) {
		return nil
	}
	if !setNamedProperty(env, harness, "callI32", createFunction(env, "callI32", (C.napi_callback)(C.GoCallI32))) {
		return nil
	}
	if !setNamedProperty(env, harness, "run", createFunction(env, "run", (C.napi_callback)(C.GoRunHarness))) {
		return nil
	}

	return harness
}

//export GoCreateHarness
func GoCreateHarness(env C.napi_env, info C.napi_callback_info) C.napi_value {
	args, _, ok := getCallbackArguments(env, info, 1)
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

	state, err := compileHarness(wasmBytes)
	if err != nil {
		throwError(env, err.Error())
		return nil
	}

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

func runNodeIndex(ctx context.Context, state *harnessState, nodeIndex []uint32) bool {
	ctx = contextWithHarnessState(ctx, state)

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
