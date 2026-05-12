//! Path validation for Tauri commands that accept user-controlled paths.
//!
//! The renderer can fabricate IPC payloads, so paths arriving from
//! `commands.*` must canonicalize and resolve under an allowed root before
//! the backend touches the filesystem. The native file picker is the user's
//! authorization gesture, but the path string travels back through the
//! WebView and could be tampered with — this module catches that case.
//!
//! The current policy is permissive: the user's home directory is the sole
//! allowed root. See `(backend/security)` in `docs/todo.md` for the rationale.
//!
//! Callers pass an `allowed_root` explicitly (see [`user_home`] for the
//! standard resolution) so the validator stays pure and trivially testable.

use std::fmt;
use std::path::{Path, PathBuf};

/// Outcome of a failed [`validate_user_path`] call.
#[derive(Debug)]
pub enum PathValidationError {
    /// `std::fs::canonicalize` failed (path missing, broken symlink,
    /// permission denied during traversal, parent directory missing for a
    /// new-file write, etc.).
    Canonicalize(std::io::Error),
    /// `std::fs::metadata` failed on the canonical path. In practice this
    /// is a TOCTOU race (deletion between canonicalize and stat) or a
    /// permission change — the path canonicalized successfully but cannot
    /// be inspected to verify it is a regular file.
    Stat(std::io::Error),
    /// Canonical path falls outside the configured allowed root.
    OutsideAllowedRoot,
    /// Path resolves to something other than a regular file (directory,
    /// symlink to a directory, device, etc.).
    NotRegularFile,
    /// Path's extension does not match the policy's expected list.
    ExtensionMismatch {
        expected: &'static [&'static str],
        found: Option<String>,
    },
    /// Raw path is malformed (no parent directory, empty file name, etc.).
    InvalidPath,
}

impl fmt::Display for PathValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Canonicalize(e) => write!(f, "Cannot canonicalize path: {e}"),
            Self::Stat(e) => write!(f, "Cannot stat path: {e}"),
            Self::OutsideAllowedRoot => {
                write!(f, "Path is outside the allowed root directory")
            }
            Self::NotRegularFile => write!(f, "Path is not a regular file"),
            Self::ExtensionMismatch { expected, found } => match found {
                Some(ext) => write!(
                    f,
                    "Unexpected file extension: got '{ext}', expected one of {expected:?}"
                ),
                None => write!(f, "File has no extension, expected one of {expected:?}"),
            },
            Self::InvalidPath => write!(f, "Path is malformed"),
        }
    }
}

impl std::error::Error for PathValidationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Canonicalize(e) | Self::Stat(e) => Some(e),
            _ => None,
        }
    }
}

/// What kind of file-existence check the policy should apply.
pub enum PathPolicy {
    /// Path must exist and resolve to a regular file under the allowed root.
    /// Used for read-side commands.
    ExistingFile { extensions: &'static [&'static str] },
    /// Parent must exist and resolve under the allowed root; the file leaf
    /// itself may not yet exist. Used for write-side commands.
    NewFileInExistingDir { extensions: &'static [&'static str] },
}

/// Resolve the user's home directory from the platform-standard env var.
/// Unix: `$HOME`. Windows: `%USERPROFILE%`. Returns `None` if unset.
pub fn user_home() -> Option<PathBuf> {
    #[cfg(unix)]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(any(unix, windows)))]
    {
        None
    }
}

/// Validate a renderer-supplied path against `allowed_root`.
///
/// On success returns the canonical path — callers MUST use the returned
/// `PathBuf` for any subsequent filesystem operation, never the original
/// raw input. Otherwise canonicalization gains achieved here are lost.
pub fn validate_user_path(
    raw: &str,
    allowed_root: &Path,
    policy: PathPolicy,
) -> Result<PathBuf, PathValidationError> {
    let canonical_root =
        std::fs::canonicalize(allowed_root).map_err(PathValidationError::Canonicalize)?;
    let raw_path = PathBuf::from(raw);

    let (canonical, extensions) = match policy {
        PathPolicy::ExistingFile { extensions } => {
            let canonical =
                std::fs::canonicalize(&raw_path).map_err(PathValidationError::Canonicalize)?;
            let metadata = std::fs::metadata(&canonical).map_err(PathValidationError::Stat)?;
            if !metadata.is_file() {
                return Err(PathValidationError::NotRegularFile);
            }
            (canonical, extensions)
        }
        PathPolicy::NewFileInExistingDir { extensions } => {
            let parent = raw_path.parent().ok_or(PathValidationError::InvalidPath)?;
            let leaf = raw_path
                .file_name()
                .ok_or(PathValidationError::InvalidPath)?;
            let canonical_parent =
                std::fs::canonicalize(parent).map_err(PathValidationError::Canonicalize)?;
            (canonical_parent.join(leaf), extensions)
        }
    };

    if !canonical.starts_with(&canonical_root) {
        return Err(PathValidationError::OutsideAllowedRoot);
    }

    let ext = canonical
        .extension()
        .and_then(|os| os.to_str())
        .map(|s| s.to_ascii_lowercase());
    // `ext` is already lowercased above; the allow-list entries are
    // expected lowercase too (callers pass `&["pdf"]`, not `&["PDF"]`),
    // so a plain `==` is sufficient.
    let matches = ext.as_deref().is_some_and(|e| extensions.contains(&e));
    if !matches {
        return Err(PathValidationError::ExtensionMismatch {
            expected: extensions,
            found: ext,
        });
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn accepts_existing_pdf_under_root() {
        let root = tempdir().expect("tempdir");
        let path = root.path().join("doc.pdf");
        fs::write(&path, b"x").unwrap();

        let canon = validate_user_path(
            path.to_str().unwrap(),
            root.path(),
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .expect("should validate");
        assert!(canon.ends_with("doc.pdf"));
    }

    #[test]
    fn rejects_path_outside_root() {
        let root = tempdir().expect("root");
        let other = tempdir().expect("other");
        let outside = other.path().join("foo.pdf");
        fs::write(&outside, b"x").unwrap();

        let err = validate_user_path(
            outside.to_str().unwrap(),
            root.path(),
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::OutsideAllowedRoot));
    }

    #[test]
    fn rejects_wrong_extension() {
        let root = tempdir().expect("root");
        let path = root.path().join("doc.txt");
        fs::write(&path, b"x").unwrap();

        let err = validate_user_path(
            path.to_str().unwrap(),
            root.path(),
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::ExtensionMismatch { .. }));
    }

    #[test]
    fn extension_check_is_case_insensitive() {
        let root = tempdir().expect("root");
        let path = root.path().join("DOC.PDF");
        fs::write(&path, b"x").unwrap();

        let canon = validate_user_path(
            path.to_str().unwrap(),
            root.path(),
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .expect("should accept uppercase extension");
        assert!(canon.extension().is_some());
    }

    #[test]
    fn rejects_directory_when_existing_file_required() {
        let root = tempdir().expect("root");
        let weird = root.path().join("dir.pdf");
        fs::create_dir(&weird).unwrap();

        let err = validate_user_path(
            weird.to_str().unwrap(),
            root.path(),
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::NotRegularFile));
    }

    #[test]
    fn rejects_traversal_via_dotdot() {
        // `../../foo.pdf` payload from inside the root. After canonicalize
        // resolves the dotdot components, the path lands outside the root
        // and OutsideAllowedRoot must fire.
        let outer = tempdir().expect("outer");
        let root = outer.path().join("root");
        fs::create_dir(&root).expect("create root");
        let inner = root.join("inner");
        fs::create_dir(&inner).expect("create inner");
        // Create a real file outside the root that the dotdot payload will
        // resolve to, so canonicalize doesn't fail with NotFound.
        let trap = outer.path().join("trap.pdf");
        fs::write(&trap, b"x").expect("write trap");
        let payload = inner.join("..").join("..").join("trap.pdf");

        let err = validate_user_path(
            payload.to_str().expect("payload utf-8"),
            &root,
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::OutsideAllowedRoot));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escaping_root() {
        use std::os::unix::fs::symlink;

        let root = tempdir().expect("root");
        let outside = tempdir().expect("outside");
        let target = outside.path().join("secret.pdf");
        fs::write(&target, b"secret").expect("write target");
        let link = root.path().join("innocent.pdf");
        symlink(&target, &link).expect("create symlink");

        let err = validate_user_path(
            link.to_str().expect("link utf-8"),
            root.path(),
            PathPolicy::ExistingFile {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::OutsideAllowedRoot));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_write_when_parent_is_symlink_to_outside() {
        use std::os::unix::fs::symlink;

        let root = tempdir().expect("root");
        let outside = tempdir().expect("outside");
        let link_parent = root.path().join("escape");
        symlink(outside.path(), &link_parent).expect("create symlink");
        let payload = link_parent.join("evil.pdf");

        let err = validate_user_path(
            payload.to_str().expect("payload utf-8"),
            root.path(),
            PathPolicy::NewFileInExistingDir {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::OutsideAllowedRoot));
    }

    #[test]
    fn new_file_in_existing_dir_accepts_nonexistent_leaf() {
        let root = tempdir().expect("root");
        let path = root.path().join("new-output.pdf");

        let canon = validate_user_path(
            path.to_str().unwrap(),
            root.path(),
            PathPolicy::NewFileInExistingDir {
                extensions: &["pdf"],
            },
        )
        .expect("should validate non-existent leaf when parent exists");
        assert!(canon.ends_with("new-output.pdf"));
    }

    #[test]
    fn new_file_rejects_when_parent_dir_missing() {
        let root = tempdir().expect("root");
        let path = root.path().join("nonexistent-subdir").join("out.pdf");

        let err = validate_user_path(
            path.to_str().unwrap(),
            root.path(),
            PathPolicy::NewFileInExistingDir {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::Canonicalize(_)));
    }

    #[test]
    fn new_file_rejects_parent_outside_root() {
        let root = tempdir().expect("root");
        let other = tempdir().expect("other");
        let path = other.path().join("escape.pdf");

        let err = validate_user_path(
            path.to_str().unwrap(),
            root.path(),
            PathPolicy::NewFileInExistingDir {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::OutsideAllowedRoot));
    }

    #[test]
    fn new_file_rejects_wrong_extension() {
        let root = tempdir().expect("root");
        let path = root.path().join("output.txt");

        let err = validate_user_path(
            path.to_str().unwrap(),
            root.path(),
            PathPolicy::NewFileInExistingDir {
                extensions: &["pdf"],
            },
        )
        .unwrap_err();
        assert!(matches!(err, PathValidationError::ExtensionMismatch { .. }));
    }
}
