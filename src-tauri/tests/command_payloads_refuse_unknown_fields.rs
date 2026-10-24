//! Ticket #465 — every command's request payload refuses a field it does not
//! know (`#[serde(deny_unknown_fields)]`): the WebView is outside the trust
//! boundary, and a misspelt or extra field must fail loudly, not be dropped.
//!
//! Rule B48 (`docs/backend-rules.md`). The check reads the sources: each
//! struct or enum a `#[tauri::command]` takes as an argument, or one holds at
//! any depth, carries the attribute where it is defined.

use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;

/// Argument types that are not request payloads: the runtime's handles,
/// the services the app injects, and the standard containers.
const NOT_A_PAYLOAD: &[&str] = &[
    "State",
    "AppHandle",
    "Window",
    "Arc",
    "Mutex",
    "HashMap",
    "Option",
    "Vec",
    "String",
];

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// Splits at the commas outside any `<>`, `()` or `[]`.
fn top_level_args(list: &str) -> Vec<&str> {
    let (mut depth, mut from, mut out) = (0i32, 0, Vec::new());
    for (i, c) in list.char_indices() {
        match c {
            '<' | '(' | '[' => depth += 1,
            '>' | ')' | ']' => depth -= 1,
            ',' if depth == 0 => {
                out.push(&list[from..i]);
                from = i + 1;
            }
            _ => {}
        }
    }
    out.push(&list[from..]);
    out
}

/// The body between the brace that opens at `open` and its match.
fn braced(text: &str, open: usize) -> &str {
    let mut depth = 0;
    for (i, c) in text[open..].char_indices() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return &text[open + 1..open + i];
                }
            }
            _ => {}
        }
    }
    &text[open + 1..]
}

struct Definition {
    denies: bool,
    /// An enum whose variants carry no field, so nothing to refuse.
    unit_enum: bool,
    /// The type names its fields or variants hold.
    holds: Vec<String>,
}

#[test]
fn test_command_payload_without_the_attribute_fails_the_scan() {
    let mut files = Vec::new();
    rust_files(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
        &mut files,
    );
    let sources: Vec<String> = files
        .iter()
        .map(|f| fs::read_to_string(f).unwrap())
        .collect();

    let type_name = Regex::new(r"\b[A-Z]\w*").unwrap();
    let payload_names = |ty: &str| -> Vec<String> {
        type_name
            .find_iter(ty)
            .map(|m| m.as_str())
            .filter(|n| {
                !NOT_A_PAYLOAD.contains(n)
                    && !n.ends_with("Service")
                    && !n.ends_with("Orchestrator")
                    && !n.ends_with("Repository")
            })
            .map(str::to_string)
            .collect()
    };

    let command =
        Regex::new(r"(?s)#\[tauri::command\].*?fn\s+\w+\s*(?:<[^>]*>)?\s*\((.*?)\)\s*(?:->|\{)")
            .unwrap();
    let mut arguments = BTreeSet::new();
    for text in &sources {
        for args in command.captures_iter(text) {
            for arg in top_level_args(&args[1]) {
                if let Some((_, ty)) = arg.split_once(':') {
                    arguments.extend(payload_names(ty));
                }
            }
        }
    }

    // Each type's definition: the attributes above it and what its body holds.
    let definition = Regex::new(
        r"(?m)((?:^\s*(?:#\[.*\]|///.*)\n)*)^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum)\s+(\w+)[^;{]*\{",
    )
    .unwrap();
    let noise = Regex::new(r"(?m)^\s*(?:#\[.*\]|//.*)$").unwrap();
    let held = Regex::new(r":([^,\n]+)|\(([^)]*)\)").unwrap();
    let mut defined: HashMap<String, Definition> = HashMap::new();
    for text in &sources {
        for d in definition.captures_iter(text) {
            let body = noise.replace_all(braced(text, d.get(0).unwrap().end() - 1), "");
            let holds: Vec<String> = held
                .captures_iter(&body)
                .flat_map(|h| payload_names(h.get(1).or(h.get(2)).unwrap().as_str()))
                .collect();
            defined.insert(
                d[3].to_string(),
                Definition {
                    denies: d[1].contains("deny_unknown_fields"),
                    unit_enum: &d[2] == "enum" && !body.contains('(') && !body.contains('{'),
                    holds,
                },
            );
        }
    }

    // An alias stands for the type it names: `type A = path::B;` holds `B`.
    let alias =
        Regex::new(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?type\s+(\w+)\s*=\s*([^;]+);").unwrap();
    for text in &sources {
        for a in alias.captures_iter(text) {
            defined.insert(
                a[1].to_string(),
                Definition {
                    denies: true,
                    unit_enum: false,
                    holds: payload_names(&a[2]),
                },
            );
        }
    }

    let unknown: Vec<&String> = arguments
        .iter()
        .filter(|a| !defined.contains_key(*a))
        .collect();
    assert!(
        unknown.is_empty(),
        "a command takes a type the scan cannot find: {unknown:?}"
    );

    // A payload is a command's argument or a type one holds, at any depth.
    let mut payloads = BTreeSet::new();
    let mut queue: Vec<String> = arguments.into_iter().collect();
    while let Some(name) = queue.pop() {
        if let Some(d) = defined.get(&name) {
            if payloads.insert(name) {
                queue.extend(d.holds.iter().cloned());
            }
        }
    }
    assert!(
        [
            "CreateOverpaymentRequest",
            "SplitPart",
            "FundPaymentGroupCandidate"
        ]
        .iter()
        .all(|p| payloads.contains(*p)),
        "the scan missed a known payload: {payloads:?}"
    );
    let missing: Vec<&String> = payloads
        .iter()
        .filter(|p| !defined[*p].denies && !defined[*p].unit_enum)
        .collect();
    assert!(
        missing.is_empty(),
        "add #[serde(deny_unknown_fields)] to: {missing:?}"
    );
}

#[test]
fn test_a_payload_with_an_unknown_field_is_refused() {
    let sent = serde_json::json!({ "source_procedure_id": "p-1", "unknown": true });
    let refused = serde_json::from_value::<
        patient_manager_app::use_cases::overpayment::CancelOverpaymentRequest,
    >(sent)
    .unwrap_err();
    assert!(refused.to_string().contains("unknown field"), "{refused}");
}

#[test]
fn test_a_tagged_variant_with_an_unknown_field_is_refused() {
    let sent = serde_json::json!({ "type": "Fund", "fund_id": "f-1", "unknown": true });
    let refused = serde_json::from_value::<
        patient_manager_app::use_cases::bank_statement_reconciliation::FundAssignment,
    >(sent)
    .unwrap_err();
    assert!(refused.to_string().contains("unknown field"), "{refused}");
}
