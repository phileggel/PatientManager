#![cfg_attr(not(test), deny(clippy::unwrap_used))]
#![cfg_attr(not(test), deny(clippy::expect_used))]
#![cfg_attr(not(test), deny(clippy::panic))]
#![cfg_attr(not(test), deny(clippy::indexing_slicing))]
#![cfg_attr(not(test), deny(clippy::todo))]
#![cfg_attr(not(test), deny(clippy::unimplemented))]
/// AI AGENT SHOULD NEVER UPDATE THIS CLIPPY BLOCK
pub mod context;
pub mod shared;
pub mod use_cases;

// Re-export repositories for use_cases modules
pub use context::fund::FundRepository;
pub use context::patient::PatientRepository;
pub use context::procedure::ProcedureTypeRepository;
pub(crate) use shared::logger::BACKEND;

/// The Tauri shell (B47): everything above builds without it.
#[cfg(feature = "app")]
mod app;
#[cfg(feature = "app")]
pub use app::initialize_app;
