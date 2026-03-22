package main

import "testing"

func TestUseInterpreterWazeroRuntimeDefaultsOff(t *testing.T) {
	if useInterpreterWazeroRuntime("") {
		t.Fatal("interpreter runtime should be disabled by default")
	}
}

func TestUseInterpreterWazeroRuntimeReadsInterpreterOverride(t *testing.T) {
	if !useInterpreterWazeroRuntime(wazeroEngineInterpreter) {
		t.Fatal("interpreter runtime should be enabled when explicitly requested")
	}
}
