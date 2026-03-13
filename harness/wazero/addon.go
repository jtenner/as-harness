package main

/*
#include <stdlib.h>
#include <node_api.h>

extern napi_value GoHello(napi_env env, napi_callback_info info);
*/
import "C"

import "unsafe"

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

func createString(env C.napi_env, value string) C.napi_value {
	cValue := C.CString(value)
	defer C.free(unsafe.Pointer(cValue))

	var result C.napi_value
	if !must(C.napi_create_string_utf8(env, cValue, C.NAPI_AUTO_LENGTH, &result), env, "failed to create string") {
		return nil
	}

	return result
}

//export GoHello
func GoHello(env C.napi_env, info C.napi_callback_info) C.napi_value {
	return createString(env, "hello from go")
}

//export GoInit
func GoInit(env C.napi_env, exports C.napi_value) C.napi_value {
	var hello C.napi_value
	if !must(C.napi_create_function(env, nil, 0, (C.napi_callback)(C.GoHello), nil, &hello), env, "failed to create hello function") {
		return nil
	}

	helloName := C.CString("hello")
	defer C.free(unsafe.Pointer(helloName))

	if !must(C.napi_set_named_property(env, exports, helloName, hello), env, "failed to export hello") {
		return nil
	}

	nameName := C.CString("name")
	defer C.free(unsafe.Pointer(nameName))

	if !must(C.napi_set_named_property(env, exports, nameName, createString(env, "wazero")), env, "failed to export name") {
		return nil
	}

	languageName := C.CString("language")
	defer C.free(unsafe.Pointer(languageName))

	if !must(C.napi_set_named_property(env, exports, languageName, createString(env, "go")), env, "failed to export language") {
		return nil
	}

	return exports
}
