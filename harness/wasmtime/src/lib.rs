use anyhow::{anyhow, Result as AnyResult};
use napi::bindgen_prelude::Buffer;
use napi::{Error, Result, Status};
use napi_derive::napi;
use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::mem::size_of;
use std::path::{Path, PathBuf};
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
const SNAPSHOT_CHECK_IMPORT: &str = "snapshot_check";
const FIXTURE_READ_IMPORT: &str = "fixture_read";
const GET_LAST_TEXT_UTF16_BYTE_LENGTH_IMPORT: &str = "get_last_text_utf16_byte_length";
const COPY_LAST_TEXT_UTF16_IMPORT: &str = "copy_last_text_utf16";
const EVENT_KIND_LOG: u32 = 10;
const EVENT_KIND_DIAGNOSTIC: u32 = 7;
const EVENT_KIND_FAIL_MESSAGE: u32 = 4;
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
const ARTIFACT_FRAME_KIND_HOOK: i32 = 3;
const HOOK_KIND_BEFORE_ALL: i32 = 1;
const HOOK_KIND_BEFORE_EACH: i32 = 2;
const HOOK_KIND_AFTER_EACH: i32 = 3;
const HOOK_KIND_AFTER_ALL: i32 = 4;
const FIXTURE_ROOT_DIRECTORY: &str = "__fixtures__";
const SNAPSHOT_ROOT_DIRECTORY: &str = "__snapshots__";
const SNAPSHOT_FILE_EXTENSION: &str = ".snap";

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

impl ArtifactConfig {
    fn is_enabled(&self) -> bool {
        !self.project_root.is_empty()
    }
}

impl ArtifactInvocationState {
    fn from_config(config: &ArtifactConfig) -> AnyResult<Self> {
        if !config.is_enabled() {
            return Ok(Self::default());
        }

        Ok(Self {
            enabled: true,
            project_root: config.project_root.clone(),
            source_file_fallback: config.source_file_fallback.clone(),
            update_snapshots: config.update_snapshots,
            last_text: String::new(),
            manifest: Some(load_snapshot_manifest(&config.project_root)?),
            occurrences_by_execution_key: BTreeMap::new(),
        })
    }

    fn set_last_text(&mut self, value: impl Into<String>) {
        self.last_text = value.into();
    }
}

fn to_posix_path(value: &str) -> String {
    value.replace('\\', "/")
}

fn normalize_relative_artifact_path(relative_path: &str) -> AnyResult<String> {
    if relative_path.is_empty() {
        return Err(anyhow!("expected a non-empty relative artifact path"));
    }

    let normalized_input = to_posix_path(relative_path);
    let mut segments = Vec::new();
    for segment in normalized_input.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err(anyhow!("artifact paths must stay within the project root"));
        }
        segments.push(segment);
    }

    let normalized = segments.join("/");
    if normalized.is_empty()
        || normalized == "."
        || normalized.starts_with('/')
        || (normalized.len() >= 3
            && normalized.as_bytes()[1] == b':'
            && normalized.as_bytes()[2] == b'/')
    {
        return Err(anyhow!("artifact paths must stay within the project root"));
    }

    Ok(normalized)
}

fn normalize_relative_source_file_path(source_file_path: &str) -> AnyResult<String> {
    match normalize_relative_artifact_path(source_file_path) {
        Ok(path) => Ok(path),
        Err(error) => {
            let basename = Path::new(&to_posix_path(source_file_path))
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_owned();
            if basename.is_empty() || basename == "." || basename == ".." {
                return Err(error);
            }
            normalize_relative_artifact_path(&basename)
        }
    }
}

fn normalize_artifact_source_file(project_root: &str, source_file: &str) -> String {
    if source_file.is_empty() {
        return String::new();
    }

    let source_path = Path::new(source_file);
    if source_path.is_absolute() {
        if let Ok(relative_path) = source_path.strip_prefix(project_root) {
            let relative_string = to_posix_path(&relative_path.to_string_lossy());
            if !relative_string.is_empty()
                && relative_string != "."
                && !relative_string.starts_with("../")
                && !Path::new(&relative_string).is_absolute()
            {
                return relative_string;
            }
        }
    }

    let normalized = to_posix_path(source_file);
    if normalized == "." || normalized.starts_with("../") || normalized.contains("/../") {
        return Path::new(&normalized)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_owned();
    }

    normalized
}

fn resolve_snapshot_relative_path(source_file_path: &str) -> AnyResult<String> {
    let normalized_source_path = normalize_relative_source_file_path(source_file_path)?;
    let source_path = Path::new(&normalized_source_path);
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("snapshot source files must provide a file name"))?;
    let parent = source_path
        .parent()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if parent.is_empty() || parent == "." {
        Ok(format!("{stem}{SNAPSHOT_FILE_EXTENSION}"))
    } else {
        Ok(format!("{parent}/{stem}{SNAPSHOT_FILE_EXTENSION}"))
    }
}

fn resolve_fixture_relative_path(source_file_path: &str, fixture_path: &str) -> AnyResult<String> {
    let normalized_source_path = normalize_relative_source_file_path(source_file_path)?;
    let normalized_fixture_path = normalize_relative_artifact_path(fixture_path)?;
    let source_directory = Path::new(&normalized_source_path)
        .parent()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if source_directory.is_empty() || source_directory == "." {
        Ok(normalized_fixture_path)
    } else {
        Ok(format!("{source_directory}/{normalized_fixture_path}"))
    }
}

fn resolve_snapshot_path(project_root: &str, source_file_path: &str) -> AnyResult<PathBuf> {
    Ok(Path::new(project_root)
        .join(SNAPSHOT_ROOT_DIRECTORY)
        .join(resolve_snapshot_relative_path(source_file_path)?))
}

fn resolve_fixture_path(
    project_root: &str,
    source_file_path: &str,
    fixture_path: &str,
) -> AnyResult<PathBuf> {
    Ok(Path::new(project_root)
        .join(FIXTURE_ROOT_DIRECTORY)
        .join(resolve_fixture_relative_path(
            source_file_path,
            fixture_path,
        )?))
}

fn create_snapshot_key(base_name: &str, occurrence: u32) -> AnyResult<String> {
    if base_name.is_empty() {
        return Err(anyhow!("expected a non-empty snapshot base name"));
    }
    Ok(format!("{base_name}~({occurrence})"))
}

fn get_snapshot_key_base_name(key: &str) -> &str {
    match key.rsplit_once("~(") {
        Some((base, suffix))
            if suffix.ends_with(')')
                && suffix[..suffix.len() - 1]
                    .chars()
                    .all(|ch| ch.is_ascii_digit()) =>
        {
            base
        }
        _ => key,
    }
}

fn escape_template_literal(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${")
}

fn read_template_literal(source_text: &str, start_offset: usize) -> AnyResult<(String, usize)> {
    let bytes = source_text.as_bytes();
    if bytes.get(start_offset) != Some(&b'`') {
        return Err(anyhow!("expected a template literal"));
    }

    let mut index = start_offset + 1;
    let mut value = String::new();
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'`' {
            return Ok((value, index + 1));
        }
        if byte == b'\\' {
            let escaped = *bytes
                .get(index + 1)
                .ok_or_else(|| anyhow!("unterminated template literal escape"))?;
            match escaped {
                b'\\' => value.push('\\'),
                b'`' => value.push('`'),
                b'n' => value.push('\n'),
                b'r' => value.push('\r'),
                b't' => value.push('\t'),
                b'$' => {
                    if bytes.get(index + 2) != Some(&b'{') {
                        return Err(anyhow!("unsupported template literal escape"));
                    }
                    value.push_str("${");
                    index += 1;
                }
                _ => return Err(anyhow!("unsupported template literal escape")),
            }
            index += 2;
            continue;
        }

        value.push(byte as char);
        index += 1;
    }

    Err(anyhow!("unterminated template literal"))
}

fn skip_whitespace(source_text: &str, mut offset: usize) -> usize {
    while source_text
        .as_bytes()
        .get(offset)
        .map(|byte| (*byte as char).is_whitespace())
        .unwrap_or(false)
    {
        offset += 1;
    }
    offset
}

fn parse_snapshot_file(source_text: &str) -> AnyResult<Vec<SnapshotEntry>> {
    let mut entries = Vec::new();
    let mut seen_keys = BTreeSet::new();
    let mut offset = skip_whitespace(source_text, 0);

    while offset < source_text.len() {
        if !source_text[offset..].starts_with("exports[") {
            return Err(anyhow!("snapshot files must use export-map assignments"));
        }
        offset += "exports[".len();
        offset = skip_whitespace(source_text, offset);
        let (key, next_offset) = read_template_literal(source_text, offset)?;
        offset = skip_whitespace(source_text, next_offset);
        if source_text.as_bytes().get(offset) != Some(&b']') {
            return Err(anyhow!("expected closing ] after snapshot key"));
        }
        offset = skip_whitespace(source_text, offset + 1);
        if source_text.as_bytes().get(offset) != Some(&b'=') {
            return Err(anyhow!("expected = after snapshot key"));
        }
        offset = skip_whitespace(source_text, offset + 1);
        let (value, next_offset) = read_template_literal(source_text, offset)?;
        offset = skip_whitespace(source_text, next_offset);
        if source_text.as_bytes().get(offset) != Some(&b';') {
            return Err(anyhow!("expected ; after snapshot entry"));
        }
        if !seen_keys.insert(key.clone()) {
            return Err(anyhow!("duplicate snapshot key: {key}"));
        }
        entries.push(SnapshotEntry {
            key,
            value,
            matched: false,
        });
        offset = skip_whitespace(source_text, offset + 1);
    }

    Ok(entries)
}

fn render_snapshot_file(entries: &[SnapshotEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    let mut rendered = String::new();
    for (index, entry) in entries.iter().enumerate() {
        if index > 0 {
            rendered.push_str("\n\n");
        }
        rendered.push_str("exports[`");
        rendered.push_str(&escape_template_literal(&entry.key));
        rendered.push_str("`] = `");
        rendered.push_str(&escape_template_literal(&entry.value));
        rendered.push_str("`;");
    }
    rendered.push('\n');
    rendered
}

fn collect_snapshot_paths(snapshot_root: &Path, output: &mut Vec<PathBuf>) -> AnyResult<()> {
    if !snapshot_root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(snapshot_root)? {
        let entry = entry?;
        let entry_path = entry.path();
        if entry.file_type()?.is_dir() {
            collect_snapshot_paths(&entry_path, output)?;
            continue;
        }
        if entry.file_type()?.is_file()
            && entry_path
                .to_str()
                .map(|value| value.ends_with(SNAPSHOT_FILE_EXTENSION))
                .unwrap_or(false)
        {
            output.push(entry_path);
        }
    }

    output.sort();
    Ok(())
}

fn create_snapshot_file_state(
    project_root: &str,
    snapshot_path: &Path,
) -> AnyResult<SnapshotFileState> {
    let snapshot_root = Path::new(project_root).join(SNAPSHOT_ROOT_DIRECTORY);
    let relative_snapshot_path = normalize_relative_artifact_path(&to_posix_path(
        &snapshot_path.strip_prefix(snapshot_root)?.to_string_lossy(),
    ))?;
    let entries = parse_snapshot_file(&fs::read_to_string(snapshot_path)?)?;
    Ok(SnapshotFileState {
        relative_snapshot_path,
        snapshot_path: snapshot_path.to_path_buf(),
        entries,
        touched: false,
        touched_execution_names: BTreeSet::new(),
    })
}

fn load_snapshot_manifest(project_root: &str) -> AnyResult<SnapshotManifest> {
    let snapshot_root = Path::new(project_root).join(SNAPSHOT_ROOT_DIRECTORY);
    let mut snapshot_paths = Vec::new();
    collect_snapshot_paths(&snapshot_root, &mut snapshot_paths)?;
    let mut files = BTreeMap::new();
    for snapshot_path in snapshot_paths {
        let state = create_snapshot_file_state(project_root, &snapshot_path)?;
        files.insert(state.relative_snapshot_path.clone(), state);
    }
    Ok(SnapshotManifest {
        project_root: project_root.to_owned(),
        files,
    })
}

fn persist_snapshot_file_state(file_state: &SnapshotFileState) -> AnyResult<()> {
    if let Some(parent) = file_state.snapshot_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        &file_state.snapshot_path,
        render_snapshot_file(&file_state.entries),
    )?;
    Ok(())
}

fn resolve_snapshot_file_state_mut<'a>(
    manifest: &'a mut SnapshotManifest,
    source_file_path: &str,
) -> AnyResult<Option<&'a mut SnapshotFileState>> {
    let relative_snapshot_path = resolve_snapshot_relative_path(source_file_path)?;
    Ok(manifest.files.get_mut(&relative_snapshot_path))
}

fn upsert_snapshot_entry(
    manifest: &mut SnapshotManifest,
    source_file_path: &str,
    key: &str,
    value: &str,
) -> AnyResult<()> {
    let relative_snapshot_path = resolve_snapshot_relative_path(source_file_path)?;
    let file_state = if manifest.files.contains_key(&relative_snapshot_path) {
        manifest.files.get_mut(&relative_snapshot_path).unwrap()
    } else {
        let snapshot_path = resolve_snapshot_path(&manifest.project_root, source_file_path)?;
        manifest.files.insert(
            relative_snapshot_path.clone(),
            SnapshotFileState {
                relative_snapshot_path: relative_snapshot_path.clone(),
                snapshot_path,
                entries: Vec::new(),
                touched: false,
                touched_execution_names: BTreeSet::new(),
            },
        );
        manifest.files.get_mut(&relative_snapshot_path).unwrap()
    };

    file_state.touched = true;
    file_state
        .touched_execution_names
        .insert(get_snapshot_key_base_name(key).to_owned());

    if let Some(entry) = file_state.entries.iter_mut().find(|entry| entry.key == key) {
        entry.value = value.to_owned();
        entry.matched = true;
    } else {
        file_state.entries.push(SnapshotEntry {
            key: key.to_owned(),
            value: value.to_owned(),
            matched: true,
        });
    }

    persist_snapshot_file_state(file_state)
}

fn match_snapshot_entry(
    manifest: &mut SnapshotManifest,
    source_file_path: &str,
    key: &str,
    actual_value: &str,
) -> AnyResult<SnapshotCheckResult> {
    let relative_snapshot_path = resolve_snapshot_relative_path(source_file_path)?;
    let Some(file_state) = resolve_snapshot_file_state_mut(manifest, source_file_path)? else {
        return Ok(SnapshotCheckResult {
            ok: false,
            outcome: "missing-snapshot-file",
            relative_snapshot_path,
            key: key.to_owned(),
            expected_value: None,
            actual_value: Some(actual_value.to_owned()),
        });
    };

    file_state.touched = true;
    file_state
        .touched_execution_names
        .insert(get_snapshot_key_base_name(key).to_owned());
    let Some(entry) = file_state.entries.iter_mut().find(|entry| entry.key == key) else {
        return Ok(SnapshotCheckResult {
            ok: false,
            outcome: "missing-snapshot-entry",
            relative_snapshot_path,
            key: key.to_owned(),
            expected_value: None,
            actual_value: Some(actual_value.to_owned()),
        });
    };

    entry.matched = true;
    if entry.value == actual_value {
        return Ok(SnapshotCheckResult {
            ok: true,
            outcome: "match",
            relative_snapshot_path,
            key: key.to_owned(),
            expected_value: Some(entry.value.clone()),
            actual_value: None,
        });
    }

    Ok(SnapshotCheckResult {
        ok: false,
        outcome: "mismatch",
        relative_snapshot_path,
        key: key.to_owned(),
        expected_value: Some(entry.value.clone()),
        actual_value: Some(actual_value.to_owned()),
    })
}

fn finalize_snapshot_manifest(
    manifest: &mut SnapshotManifest,
    update_snapshots: bool,
) -> AnyResult<SnapshotFinalizeResult> {
    let mut stale_entries = Vec::new();
    for file_state in manifest.files.values_mut() {
        if !file_state.touched {
            continue;
        }

        let mut next_entries = Vec::new();
        let mut removed_any_entries = false;
        for entry in file_state.entries.drain(..) {
            let execution_name = get_snapshot_key_base_name(&entry.key).to_owned();
            let is_touched_execution = file_state.touched_execution_names.contains(&execution_name);
            if entry.matched || !is_touched_execution {
                next_entries.push(entry);
                continue;
            }

            stale_entries.push(StaleSnapshotEntry {
                relative_snapshot_path: file_state.relative_snapshot_path.clone(),
                key: entry.key.clone(),
            });
            if update_snapshots {
                removed_any_entries = true;
                continue;
            }
            next_entries.push(entry);
        }

        if update_snapshots && removed_any_entries {
            file_state.entries = next_entries;
            persist_snapshot_file_state(file_state)?;
        } else {
            file_state.entries = next_entries;
        }
    }

    Ok(SnapshotFinalizeResult {
        ok: update_snapshots || stale_entries.is_empty(),
        stale_entries,
    })
}

fn hook_execution_name(hook_kind: i32) -> &'static str {
    match hook_kind {
        HOOK_KIND_BEFORE_ALL => "before hook",
        HOOK_KIND_BEFORE_EACH => "beforeEach hook",
        HOOK_KIND_AFTER_EACH => "afterEach hook",
        HOOK_KIND_AFTER_ALL => "after hook",
        _ => "hook",
    }
}

fn resolve_snapshot_execution_name(frame: Option<&ActiveArtifactFrame>, label: &str) -> String {
    if !label.is_empty() {
        return label.to_owned();
    }
    match frame {
        Some(frame) if frame.kind == ARTIFACT_FRAME_KIND_HOOK => {
            hook_execution_name(frame.hook_kind).to_owned()
        }
        Some(frame) => frame.name.clone(),
        None => String::new(),
    }
}

fn format_snapshot_check_failure(result: &SnapshotCheckResult) -> String {
    match result.outcome {
        "missing-snapshot-file" => format!(
            "snapshot missing file: {} :: {}",
            result.relative_snapshot_path, result.key
        ),
        "missing-snapshot-entry" => format!(
            "snapshot missing entry: {} :: {}",
            result.relative_snapshot_path, result.key
        ),
        "mismatch" => format!(
            "snapshot mismatch: {} :: {}\nexpected: {}\nactual: {}",
            result.relative_snapshot_path,
            result.key,
            result.expected_value.clone().unwrap_or_default(),
            result.actual_value.clone().unwrap_or_default(),
        ),
        _ => "snapshot comparison failed".to_owned(),
    }
}

fn format_snapshot_stale_entry(entry: &StaleSnapshotEntry) -> String {
    format!(
        "stale snapshot entry: {} :: {}",
        entry.relative_snapshot_path, entry.key
    )
}

fn finalize_artifact_invocation(
    artifact: &mut ArtifactInvocationState,
) -> AnyResult<SnapshotFinalizeResult> {
    match artifact.manifest.as_mut() {
        Some(manifest) => finalize_snapshot_manifest(manifest, artifact.update_snapshots),
        None => Ok(SnapshotFinalizeResult {
            ok: true,
            stale_entries: Vec::new(),
        }),
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
    artifact: ArtifactInvocationState,
}

#[napi]
pub struct NativeHarness {
    engine: Engine,
    module: Module,
    closed: Cell<bool>,
    coverage: Rc<RefCell<CoverageCollector>>,
    artifact_config: ArtifactConfig,
}

#[napi]
pub fn create_harness(
    bytes: Buffer,
    project_root: Option<String>,
    source_file_fallback: Option<String>,
    update_snapshots: Option<bool>,
) -> Result<NativeHarness> {
    let engine = Engine::default();
    let module = Module::new(&engine, bytes.as_ref()).map_err(to_napi_error)?;
    let artifact_config = ArtifactConfig {
        project_root: project_root.unwrap_or_default(),
        source_file_fallback: source_file_fallback.unwrap_or_default(),
        update_snapshots: update_snapshots.unwrap_or(false),
    };

    Ok(NativeHarness {
        engine,
        module,
        closed: Cell::new(false),
        coverage: Rc::new(RefCell::new(CoverageCollector::default())),
        artifact_config,
    })
}

#[derive(Clone, Default)]
struct ArtifactConfig {
    project_root: String,
    source_file_fallback: String,
    update_snapshots: bool,
}

#[derive(Default)]
struct ArtifactInvocationState {
    enabled: bool,
    project_root: String,
    source_file_fallback: String,
    update_snapshots: bool,
    last_text: String,
    manifest: Option<SnapshotManifest>,
    occurrences_by_execution_key: BTreeMap<String, u32>,
}

struct SnapshotManifest {
    project_root: String,
    files: BTreeMap<String, SnapshotFileState>,
}

struct SnapshotFileState {
    relative_snapshot_path: String,
    snapshot_path: PathBuf,
    entries: Vec<SnapshotEntry>,
    touched: bool,
    touched_execution_names: BTreeSet<String>,
}

struct SnapshotEntry {
    key: String,
    value: String,
    matched: bool,
}

struct SnapshotCheckResult {
    ok: bool,
    outcome: &'static str,
    relative_snapshot_path: String,
    key: String,
    expected_value: Option<String>,
    actual_value: Option<String>,
}

struct SnapshotFinalizeResult {
    ok: bool,
    stale_entries: Vec<StaleSnapshotEntry>,
}

struct StaleSnapshotEntry {
    relative_snapshot_path: String,
    key: String,
}

#[napi]
impl NativeHarness {
    #[napi(js_name = "callI32")]
    pub fn call_i32(&self, export_name: String) -> Result<u32> {
        self.assert_open()?;

        let (mut store, instance) = self.instantiate(ArtifactInvocationState::default())?;
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

        let artifact_state =
            ArtifactInvocationState::from_config(&self.artifact_config).map_err(to_napi_error)?;
        let (mut store, instance) = self.instantiate(artifact_state)?;
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

        let mut finalization_ok = true;
        if export_name == RUN_EXPORT {
            if let Ok(finalized) = finalize_artifact_invocation(&mut store.data_mut().artifact) {
                finalization_ok = finalized.ok;
                if !finalized.ok {
                    for entry in finalized.stale_entries {
                        store.data_mut().events.push(RawHarnessEvent {
                            kind: EVENT_KIND_FAIL_MESSAGE,
                            payload: Buffer::from(format_snapshot_stale_entry(&entry).into_bytes()),
                        });
                    }
                }
            } else {
                finalization_ok = false;
            }
        }

        let events = std::mem::take(&mut store.data_mut().events);
        Ok(RawInvocationResult {
            ok: outcome.unwrap_or(false) && finalization_ok,
            events,
        })
    }

    fn instantiate(
        &self,
        artifact_state: ArtifactInvocationState,
    ) -> Result<(Store<HostState>, Instance)> {
        let mut store = Store::new(
            &self.engine,
            HostState {
                events: Vec::new(),
                invoke: None,
                coverage: Rc::clone(&self.coverage),
                artifact: artifact_state,
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

        linker
            .func_wrap(
                ARTIFACT_IMPORT_MODULE,
                SNAPSHOT_CHECK_IMPORT,
                |mut caller: Caller<'_, HostState>,
                 actual_ptr: u32,
                 label_ptr: u32|
                 -> AnyResult<u32> {
                    let memory = match get_memory_from_caller(&mut caller) {
                        Ok(memory) => memory,
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                    };
                    if !caller.data().artifact.enabled || caller.data().artifact.manifest.is_none()
                    {
                        caller
                            .data_mut()
                            .artifact
                            .set_last_text("snapshot artifacts require a configured project root");
                        return Ok(0);
                    }

                    let frame = read_active_artifact_frame(&mut caller).unwrap_or(None);
                    let normalized_frame_source_file = frame
                        .as_ref()
                        .map(|frame| {
                            normalize_artifact_source_file(
                                &caller.data().artifact.project_root,
                                &frame.source_file,
                            )
                        })
                        .unwrap_or_default();
                    let source_file = if !normalized_frame_source_file.is_empty() {
                        normalized_frame_source_file
                    } else {
                        caller.data().artifact.source_file_fallback.clone()
                    };
                    if source_file.is_empty() {
                        caller
                            .data_mut()
                            .artifact
                            .set_last_text("snapshot requires an active declaration source file");
                        return Ok(0);
                    }

                    let actual_value = match read_assembly_string(&memory, &caller, actual_ptr) {
                        Ok(value) => value,
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                    };
                    let label = match read_assembly_string(&memory, &caller, label_ptr) {
                        Ok(value) => value,
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                    };
                    let execution_name = resolve_snapshot_execution_name(frame.as_ref(), &label);
                    if execution_name.is_empty() {
                        caller
                            .data_mut()
                            .artifact
                            .set_last_text("snapshot requires a non-empty execution name");
                        return Ok(0);
                    }

                    let occurrence_key = format!("{source_file}\u{0}{execution_name}");
                    let occurrence = caller
                        .data()
                        .artifact
                        .occurrences_by_execution_key
                        .get(&occurrence_key)
                        .copied()
                        .unwrap_or(0);
                    caller
                        .data_mut()
                        .artifact
                        .occurrences_by_execution_key
                        .insert(occurrence_key, occurrence + 1);
                    let key = match create_snapshot_key(&execution_name, occurrence) {
                        Ok(key) => key,
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                    };

                    if caller.data().artifact.update_snapshots {
                        let manifest = caller
                            .data_mut()
                            .artifact
                            .manifest
                            .as_mut()
                            .ok_or_else(|| anyhow!("missing snapshot manifest"))?;
                        if let Err(error) =
                            upsert_snapshot_entry(manifest, &source_file, &key, &actual_value)
                        {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                        caller.data_mut().artifact.set_last_text("");
                        return Ok(1);
                    }

                    let result = {
                        let manifest = caller
                            .data_mut()
                            .artifact
                            .manifest
                            .as_mut()
                            .ok_or_else(|| anyhow!("missing snapshot manifest"))?;
                        match match_snapshot_entry(manifest, &source_file, &key, &actual_value) {
                            Ok(result) => result,
                            Err(error) => {
                                caller.data_mut().artifact.set_last_text(error.to_string());
                                return Ok(0);
                            }
                        }
                    };
                    if result.ok {
                        caller.data_mut().artifact.set_last_text("");
                        return Ok(1);
                    }

                    caller
                        .data_mut()
                        .artifact
                        .set_last_text(format_snapshot_check_failure(&result));
                    Ok(0)
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                ARTIFACT_IMPORT_MODULE,
                FIXTURE_READ_IMPORT,
                |mut caller: Caller<'_, HostState>, path_ptr: u32| -> AnyResult<u32> {
                    let memory = match get_memory_from_caller(&mut caller) {
                        Ok(memory) => memory,
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                    };
                    if !caller.data().artifact.enabled
                        || caller.data().artifact.project_root.is_empty()
                    {
                        caller
                            .data_mut()
                            .artifact
                            .set_last_text("fixture artifacts require a configured project root");
                        return Ok(0);
                    }

                    let frame = read_active_artifact_frame(&mut caller).unwrap_or(None);
                    let normalized_frame_source_file = frame
                        .as_ref()
                        .map(|frame| {
                            normalize_artifact_source_file(
                                &caller.data().artifact.project_root,
                                &frame.source_file,
                            )
                        })
                        .unwrap_or_default();
                    let source_file = if !normalized_frame_source_file.is_empty() {
                        normalized_frame_source_file
                    } else {
                        caller.data().artifact.source_file_fallback.clone()
                    };
                    if source_file.is_empty() {
                        caller
                            .data_mut()
                            .artifact
                            .set_last_text("fixture requires an active declaration source file");
                        return Ok(0);
                    }

                    let fixture_path = match read_assembly_string(&memory, &caller, path_ptr) {
                        Ok(value) => value,
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                    };
                    let resolved_path = match resolve_fixture_path(
                        &caller.data().artifact.project_root,
                        &source_file,
                        &fixture_path,
                    ) {
                        Ok(path) => path,
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            return Ok(0);
                        }
                    };
                    match fs::read_to_string(resolved_path) {
                        Ok(value) => {
                            caller.data_mut().artifact.set_last_text(value);
                            Ok(1)
                        }
                        Err(error) => {
                            caller.data_mut().artifact.set_last_text(error.to_string());
                            Ok(0)
                        }
                    }
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                ARTIFACT_IMPORT_MODULE,
                GET_LAST_TEXT_UTF16_BYTE_LENGTH_IMPORT,
                |caller: Caller<'_, HostState>| -> u32 {
                    caller
                        .data()
                        .artifact
                        .last_text
                        .encode_utf16()
                        .count()
                        .saturating_mul(2) as u32
                },
            )
            .map_err(to_napi_error)?;

        linker
            .func_wrap(
                ARTIFACT_IMPORT_MODULE,
                COPY_LAST_TEXT_UTF16_IMPORT,
                |mut caller: Caller<'_, HostState>, destination_ptr: u32| -> AnyResult<()> {
                    let memory = get_memory_from_caller(&mut caller)?;
                    let mut utf16_bytes = Vec::new();
                    for code_unit in caller.data().artifact.last_text.encode_utf16() {
                        utf16_bytes.extend_from_slice(&code_unit.to_le_bytes());
                    }
                    memory.write(&mut caller, destination_ptr as usize, &utf16_bytes)?;
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

        let _ = self.instantiate(ArtifactInvocationState::default());
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
