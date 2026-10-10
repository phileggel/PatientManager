# TODO-013 — (backend) — Headless surface API

A way to drive PatientManager's use cases without the window: the same Rust commands the UI calls, reachable from outside the UI.

**User value:** an agent (e.g. Claude) or another tool can read and act on the practice's data on this machine, through the same rules the app follows.

**Done when:** a `patientmanager` command-line program and an MCP server (a thin layer over the same commands) expose the use cases the UI offers, read and write. Local only: stdio, no network listener. Every write needs an explicit confirmation (`--yes` on the CLI, a confirm step in MCP). Every call is written to an audit log (command, time, record ids — no patient data). A caller must present a credential created and revocable in the app (OS-keychain key or certificate, decided in the spec). Starts with `/spec-writer`; comes after TODO-016. Accepted by the owner: data an agent reads (names, SSNs) is sent to the model provider as conversation content.

**Design:** none

**Open questions:** none
