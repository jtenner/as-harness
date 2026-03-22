use anyhow::{anyhow, Result as AnyResult};
use napi::bindgen_prelude::Buffer;
use napi::{Error, Result, Status};
use napi_derive::napi;
use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, BTreeSet};
use std::mem::size_of;
use std::rc::Rc;
use wasmtime::{
    AsContextMut, Caller, Engine, Extern, Instance, Linker, Memory, Module, Store, TypedFunc,
};

const ALLOCATE_NODE_INDEX_BUFFER_EXPORT: &str = "allocateNodeIndexBuffer";
const DISCOVER_EXPORT: &str = "discover";
const INVOKE_EXPORT: &str = "invoke";
const RUN_EXPORT: &str = "run";
const START_EXPORT: &str = "__start";
const COVER_IMPORT_MODULE: &str = "__asCovers";
const ARTIFACT_IMPORT_MODULE: &str = "__asArtifacts";
const CAPTURE_ACTIVE_ARTIFACT_FRAME_IMPORT: &str = "capture_active_frame";
const EVENT_KIND_LOG: u32 = 10;
const EVENT_KIND_DIAGNOSTIC: u32 = 7;
const ACTIVE_ARTIFACT_FRAME_DEPTH_EXPORT: &str = "getActiveArtifactFrameDepth";
const ACTIVE_ARTIFACT_FRAME_KIND_EXPORT: &str = "getActiveArtifactFrameKind";
const ACTIVE_ARTIFACT_FRAME_NODE_KIND_EXPORT: &str = "getActiveArtifactFrameNodeKind";
const ACTIVE_ARTIFACT_FRAME_HOOK_KIND_EXPORT: &str = "getActiveArtifactFrameHookKind";
const ACTIVE_ARTIFACT_FRAME_NAME_EXPORT: &str = "getActiveArtifactFrameName";
const ACTIVE_ARTIFACT_FRAME_SOURCE_FILE_EXPORT: &str = "getActiveArtifactFrameSourceFile";
const ACTIVE_ARTIFACT_FRAME_SOURCE_LINE_EXPORT: &str = "getActiveArtifactFrameSourceLine";
const ACTIVE_ARTIFACT_FRAME_SOURCE_COLUMN_EXPORT: &str = "getActiveArtifactFrameSourceColumn";
const ACTIVE_ARTIFACT_FRAME_NODE_INDEX_LENGTH_EXPORT: &str =
    "getActiveArtifactFrameNodeIndexLength";
const ACTIVE_ARTIFACT_FRAME_NODE_INDEX_ELEMENT_EXPORT: &str =
    "getActiveArtifactFrameNodeIndexElement";

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

#[napi(object)]
pub struct RawCoveragePoint {
    pub id: u32,
    pub file: String,
    pub line: i32,
    pub column: i32,
    pub cover_type: u32,
}

#[napi(object)]
pub struct RawCoverageSnapshot {
    pub points: Vec<RawCoveragePoint>,
    pub covered_ids: Vec<u32>,
}

#[derive(Clone)]
struct CoveragePoint {
    id: u32,
    file: String,
    line: i32,
    column: i32,
    cover_type: u32,
}

#[derive(Default)]
struct CoverageCollector {
    points: BTreeMap<u32, CoveragePoint>,
    covered_ids: BTreeSet<u32>,
}

struct ActiveArtifactFrame {
    depth: i32,
    kind: i32,
    node_kind: i32,
    hook_kind: i32,
    name: String,
    source_file: String,
    source_line: i32,
    source_column: i32,
    node_index: Vec<u32>,
}

impl ActiveArtifactFrame {
    fn format_message(&self) -> String {
        format!(
            "depth={} kind={} nodeKind={} hookKind={} name={} file={} line={} column={} index=[{}]",
            self.depth,
            self.kind,
            self.node_kind,
            self.hook_kind,
            self.name,
            self.source_file,
            self.source_line,
            self.source_column,
            self.node_index
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(","),
        )
    }
}

impl CoverageCollector {
    fn declare(&mut self, point: CoveragePoint) {
        match self.points.get(&point.id) {
            Some(existing)
                if existing.file == point.file
                    && existing.line == point.line
                    && existing.column == point.column
                    && existing.cover_type == point.cover_type => {}
            None => {
                self.points.insert(point.id, point);
            }
            Some(_) => {}
        }
    }

    fn hit(&mut self, id: u32) {
        self.covered_ids.insert(id);
    }

    fn reset(&mut self) {
        self.points.clear();
        self.covered_ids.clear();
    }

    fn snapshot(&self) -> RawCoverageSnapshot {
        RawCoverageSnapshot {
            points: self
                .points
                .values()
                .cloned()
                .map(|point| RawCoveragePoint {
                    id: point.id,
                    file: point.file,
                    line: point.line,
                    column: point.column,
                    cover_type: point.cover_type,
                })
                .collect(),
            covered_ids: self.covered_ids.iter().copied().collect(),
        }
    }
}

#[derive(Default)]
struct HostState {
    events: Vec<RawHarnessEvent>,
    invoke: Option<TypedFunc<(), ()>>,
    coverage: Rc<RefCell<CoverageCollector>>,
}

#[napi]
pub struct NativeHarness {
    engine: Engine,
    module: Module,
    closed: Cell<bool>,
    coverage: Rc<RefCell<CoverageCollector>>,
}

#[napi]
pub fn create_harness(bytes: Buffer) -> Result<NativeHarness> {
    let engine = Engine::default();
    let module = Module::new(&engine, bytes.as_ref()).map_err(to_napi_error)?;

    Ok(NativeHarness {
        engine,
        module,
        closed: Cell::new(false),
        coverage: Rc::new(RefCell::new(CoverageCollector::default())),
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

    #[napi(js_name = "getCoverageSnapshot")]
    pub fn get_coverage_snapshot(&self) -> RawCoverageSnapshot {
        self.prime_coverage_if_needed();
        self.coverage.borrow().snapshot()
    }

    #[napi(js_name = "resetCoverage")]
    pub fn reset_coverage(&self) {
        self.coverage.borrow_mut().reset();
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
        let mut store = Store::new(
            &self.engine,
            HostState {
                events: Vec::new(),
                invoke: None,
                coverage: Rc::clone(&self.coverage),
            },
        );
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

        linker
            .func_wrap(
                COVER_IMPORT_MODULE,
                "coverDeclare",
                |mut caller: Caller<'_, HostState>,
                 file_ptr: u32,
                 id: u32,
                 line: i32,
                 column: i32,
                 cover_type: u32|
                 -> AnyResult<()> {
                    let memory = get_memory_from_caller(&mut caller)?;
                    let file = read_assembly_string(&memory, &caller, file_ptr)?;
                    caller.data().coverage.borrow_mut().declare(CoveragePoint {
                        id,
                        file,
                        line,
                        column,
                        cover_type,
                    });
                    Ok(())
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                COVER_IMPORT_MODULE,
                "cover",
                |caller: Caller<'_, HostState>, id: u32| {
                    caller.data().coverage.borrow_mut().hit(id);
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                ARTIFACT_IMPORT_MODULE,
                CAPTURE_ACTIVE_ARTIFACT_FRAME_IMPORT,
                |mut caller: Caller<'_, HostState>| -> AnyResult<()> {
                    let Some(frame) = read_active_artifact_frame(&mut caller)? else {
                        return Ok(());
                    };

                    caller.data_mut().events.push(RawHarnessEvent {
                        kind: EVENT_KIND_DIAGNOSTIC,
                        payload: Buffer::from(encode_diagnostic_payload(
                            &frame.node_index,
                            &frame.format_message(),
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

    fn prime_coverage_if_needed(&self) {
        let should_prime = self.coverage.borrow().points.is_empty();
        if !should_prime || self.closed.get() {
            return;
        }

        let _ = self.instantiate();
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

fn get_exported_func(
    caller: &mut Caller<'_, HostState>,
    export_name: &str,
) -> AnyResult<wasmtime::Func> {
    match caller.get_export(export_name) {
        Some(Extern::Func(func)) => Ok(func),
        _ => Err(anyhow!("missing export {export_name}")),
    }
}

fn call_i32_export(caller: &mut Caller<'_, HostState>, export_name: &str) -> AnyResult<i32> {
    let func = get_exported_func(caller, export_name)?;
    let typed = func.typed::<(), i32>(&caller)?;
    typed.call(caller.as_context_mut(), ())
}

fn call_i32_index_export(
    caller: &mut Caller<'_, HostState>,
    export_name: &str,
    index: i32,
) -> AnyResult<i32> {
    let func = get_exported_func(caller, export_name)?;
    let typed = func.typed::<i32, i32>(&caller)?;
    typed.call(caller.as_context_mut(), index)
}

fn read_active_artifact_frame(
    caller: &mut Caller<'_, HostState>,
) -> AnyResult<Option<ActiveArtifactFrame>> {
    let depth = call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_DEPTH_EXPORT)?;
    if depth <= 0 {
        return Ok(None);
    }

    let kind = call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_KIND_EXPORT)?;
    let node_kind = call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_NODE_KIND_EXPORT)?;
    let hook_kind = call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_HOOK_KIND_EXPORT)?;
    let source_line = call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_SOURCE_LINE_EXPORT)?;
    let source_column = call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_SOURCE_COLUMN_EXPORT)?;
    let node_index_length =
        call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_NODE_INDEX_LENGTH_EXPORT)?;
    let name_pointer = call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_NAME_EXPORT)? as u32;
    let source_file_pointer =
        call_i32_export(caller, ACTIVE_ARTIFACT_FRAME_SOURCE_FILE_EXPORT)? as u32;
    let memory = get_memory_from_caller(caller)?;

    let mut node_index = Vec::with_capacity(node_index_length.max(0) as usize);
    for index in 0..node_index_length {
        node_index.push(call_i32_index_export(
            caller,
            ACTIVE_ARTIFACT_FRAME_NODE_INDEX_ELEMENT_EXPORT,
            index,
        )? as u32);
    }

    Ok(Some(ActiveArtifactFrame {
        depth,
        kind,
        node_kind,
        hook_kind,
        name: read_assembly_string(&memory, &*caller, name_pointer)?,
        source_file: read_assembly_string(&memory, &*caller, source_file_pointer)?,
        source_line,
        source_column,
        node_index,
    }))
}

fn encode_diagnostic_payload(node_index: &[u32], message: &str) -> Vec<u8> {
    let message_bytes = message.as_bytes();
    let mut payload = Vec::with_capacity(
        size_of::<u32>()
            + (node_index.len() * size_of::<u32>())
            + size_of::<u32>()
            + message_bytes.len(),
    );

    payload.extend_from_slice(&(node_index.len() as u32).to_le_bytes());
    for segment in node_index {
        payload.extend_from_slice(&segment.to_le_bytes());
    }
    payload.extend_from_slice(&(message_bytes.len() as u32).to_le_bytes());
    payload.extend_from_slice(message_bytes);
    payload
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
