use anyhow::{anyhow, Result as AnyResult};
use napi::bindgen_prelude::Buffer;
use napi::{Error, Result, Status};
use napi_derive::napi;
use std::cell::Cell;
use std::mem::size_of;
use wasmtime::{
    AsContextMut, Caller, Engine, Extern, Instance, Linker, Memory, Module, Store, TypedFunc,
};

const ALLOCATE_NODE_INDEX_BUFFER_EXPORT: &str = "allocateNodeIndexBuffer";
const DISCOVER_EXPORT: &str = "discover";
const INVOKE_EXPORT: &str = "invoke";
const RUN_EXPORT: &str = "run";
const START_EXPORT: &str = "__start";
const EVENT_KIND_LOG: u32 = 10;

#[napi(object)]
pub struct RawHarnessEvent {
    pub kind: u32,
    pub payload: Buffer,
}

#[napi(object)]
pub struct RawInvocationResult {
    pub ok: bool,
    pub events: Vec<RawHarnessEvent>,
}

#[derive(Default)]
struct HostState {
    events: Vec<RawHarnessEvent>,
    invoke: Option<TypedFunc<(), ()>>,
}

#[napi]
pub struct NativeHarness {
    engine: Engine,
    module: Module,
    closed: Cell<bool>,
}

#[napi]
pub fn create_harness(bytes: Buffer) -> Result<NativeHarness> {
    let engine = Engine::default();
    let module = Module::new(&engine, bytes.as_ref()).map_err(to_napi_error)?;

    Ok(NativeHarness {
        engine,
        module,
        closed: Cell::new(false),
    })
}

#[napi]
impl NativeHarness {
    #[napi(js_name = "callI32")]
    pub fn call_i32(&self, export_name: String) -> Result<u32> {
        self.assert_open()?;

        let (mut store, instance) = self.instantiate()?;
        let export = instance
            .get_func(&mut store, &export_name)
            .ok_or_else(call_i32_error)?;
        let typed = export
            .typed::<(), i32>(&store)
            .map_err(|_| call_i32_error())?;
        let result = typed.call(&mut store, ()).map_err(|_| call_i32_error())?;
        Ok(result as u32)
    }

    #[napi]
    pub fn discover(&self, node_index: Vec<u32>) -> Result<RawInvocationResult> {
        self.call_node_index_export(DISCOVER_EXPORT, node_index, |result| result >= 0)
    }

    #[napi]
    pub fn run(&self, node_index: Vec<u32>) -> Result<RawInvocationResult> {
        self.call_node_index_export(RUN_EXPORT, node_index, |result| result == 1)
    }

    #[napi]
    pub fn close(&self) {
        self.closed.set(true);
    }
}

impl NativeHarness {
    fn assert_open(&self) -> Result<()> {
        if self.closed.get() {
            return Err(Error::new(
                Status::GenericFailure,
                "harness is closed".to_owned(),
            ));
        }

        Ok(())
    }

    fn call_node_index_export<F>(
        &self,
        export_name: &str,
        node_index: Vec<u32>,
        is_success: F,
    ) -> Result<RawInvocationResult>
    where
        F: FnOnce(i32) -> bool,
    {
        self.assert_open()?;

        let (mut store, instance) = self.instantiate()?;
        let outcome = (|| -> AnyResult<bool> {
            let memory = get_memory(&mut store, &instance)?;
            let allocate = instance
                .get_typed_func::<u32, u32>(&mut store, ALLOCATE_NODE_INDEX_BUFFER_EXPORT)?;
            let pointer = allocate.call(&mut store, node_index.len() as u32)?;

            for (index, segment) in node_index.iter().enumerate() {
                let offset = pointer as usize + index * 4;
                memory.write(&mut store, offset, &segment.to_le_bytes())?;
            }

            let export = instance.get_typed_func::<(), i32>(&mut store, export_name)?;
            let result = export.call(&mut store, ())?;
            Ok(is_success(result))
        })();

        let events = std::mem::take(&mut store.data_mut().events);
        Ok(RawInvocationResult {
            ok: outcome.unwrap_or(false),
            events,
        })
    }

    fn instantiate(&self) -> Result<(Store<HostState>, Instance)> {
        let mut store = Store::new(&self.engine, HostState::default());
        let mut linker = Linker::new(&self.engine);

        linker
            .func_wrap(
                "as-harness",
                "write_event",
                |mut caller: Caller<'_, HostState>,
                 kind: u32,
                 payload_ptr: u32,
                 payload_len: u32|
                 -> AnyResult<()> {
                    let memory = get_memory_from_caller(&mut caller)?;
                    let mut payload = vec![0u8; payload_len as usize];
                    memory.read(&caller, payload_ptr as usize, &mut payload)?;
                    caller.data_mut().events.push(RawHarnessEvent {
                        kind,
                        payload: Buffer::from(payload),
                    });
                    Ok(())
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                "as-harness",
                "invoke_staged",
                |mut caller: Caller<'_, HostState>| -> i32 {
                    let invoke = caller.data().invoke.clone();
                    let Some(invoke) = invoke else {
                        return 0;
                    };

                    if invoke.call(caller.as_context_mut(), ()).is_ok() {
                        1
                    } else {
                        0
                    }
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                "env",
                "abort",
                |mut caller: Caller<'_, HostState>,
                 message_ptr: u32,
                 file_name_ptr: u32,
                 line: i32,
                 column: i32|
                 -> AnyResult<()> {
                    let memory = get_memory_from_caller(&mut caller)?;
                    Err(anyhow!(
                        "abort: {} at {}:{}:{}",
                        read_assembly_string(&memory, &caller, message_ptr)?,
                        read_assembly_string(&memory, &caller, file_name_ptr)?,
                        line,
                        column,
                    ))
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                "env",
                "trace",
                |mut caller: Caller<'_, HostState>,
                 message_ptr: u32,
                 value_count: i32,
                 a0: f64,
                 a1: f64,
                 a2: f64,
                 a3: f64,
                 a4: f64|
                 -> AnyResult<()> {
                    let memory = get_memory_from_caller(&mut caller)?;
                    let message = read_assembly_string(&memory, &caller, message_ptr)?;
                    let values = [a0, a1, a2, a3, a4];
                    let clamped_value_count = value_count.clamp(0, values.len() as i32) as usize;
                    caller.data_mut().events.push(RawHarnessEvent {
                        kind: EVENT_KIND_LOG,
                        payload: Buffer::from(encode_log_payload(
                            &message,
                            &values[..clamped_value_count],
                        )),
                    });
                    Ok(())
                },
            )
            .map_err(to_napi_error)?;

        let instance = linker
            .instantiate(&mut store, &self.module)
            .map_err(to_napi_error)?;

        if let Some(invoke) = instance.get_func(&mut store, INVOKE_EXPORT) {
            if let Ok(typed) = invoke.typed::<(), ()>(&store) {
                store.data_mut().invoke = Some(typed);
            }
        }

        if let Some(start) = instance.get_func(&mut store, START_EXPORT) {
            let start = start.typed::<(), ()>(&store).map_err(to_napi_error)?;
            start.call(&mut store, ()).map_err(to_napi_error)?;
        }

        Ok((store, instance))
    }
}

fn call_i32_error() -> Error {
    Error::new(
        Status::GenericFailure,
        "failed to call zero-argument i32 export".to_owned(),
    )
}

fn get_memory(store: &mut Store<HostState>, instance: &Instance) -> AnyResult<Memory> {
    match instance.get_export(store, "memory") {
        Some(Extern::Memory(memory)) => Ok(memory),
        _ => Err(anyhow!("missing memory export")),
    }
}

fn get_memory_from_caller(caller: &mut Caller<'_, HostState>) -> AnyResult<Memory> {
    match caller.get_export("memory") {
        Some(Extern::Memory(memory)) => Ok(memory),
        _ => Err(anyhow!("missing memory export")),
    }
}

fn read_assembly_string(
    memory: &Memory,
    context: impl wasmtime::AsContext,
    pointer: u32,
) -> AnyResult<String> {
    if pointer == 0 {
        return Ok(String::new());
    }

    let length_pointer = (pointer as usize)
        .checked_sub(4)
        .ok_or_else(|| anyhow!("invalid AssemblyScript string pointer"))?;
    let mut length_bytes = [0u8; 4];
    memory.read(&context, length_pointer, &mut length_bytes)?;
    let byte_length = u32::from_le_bytes(length_bytes) as usize;
    let mut utf16_bytes = vec![0u8; byte_length];
    memory.read(&context, pointer as usize, &mut utf16_bytes)?;

    let utf16 = utf16_bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect::<Vec<_>>();

    String::from_utf16(&utf16).map_err(|error| anyhow!(error.to_string()))
}

fn encode_log_payload(message: &str, values: &[f64]) -> Vec<u8> {
    let message_bytes = message.as_bytes();
    let values_byte_length = values.len() * size_of::<f64>();
    let mut payload = Vec::with_capacity(
        size_of::<u32>() + values_byte_length + size_of::<u32>() + message_bytes.len(),
    );

    payload.extend_from_slice(&(values.len() as u32).to_le_bytes());
    for value in values {
        payload.extend_from_slice(&value.to_le_bytes());
    }
    payload.extend_from_slice(&(message_bytes.len() as u32).to_le_bytes());
    payload.extend_from_slice(message_bytes);
    payload
}

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::new(Status::GenericFailure, error.to_string())
}
