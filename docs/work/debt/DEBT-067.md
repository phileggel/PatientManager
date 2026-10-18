# 2026-10-17 — DEBT-067 — Three zip advisories through calamine wait on a calamine release with zip 9

**Found by:** `/dep-audit`, release preparation of 2026-10-17 (`cargo audit`: 13 vulnerabilities, 9 after the rustls update of #296)

**Where:** `src-tauri/Cargo.toml` (`calamine` 0.36.1), `src-tauri/Cargo.lock` (`zip` 8.6.0; 4.6.1 and 7.2.0 locked but not in this platform's build)

**Observation:** RUSTSEC-2026-0367, 0368 and 0369 concern `ZipArchive::extract` and `ZipStreamReader::extract` — SUID bits kept, symbolic links followed out of the target, permissions applied through links — fixed in `zip` 9.0. The application reaches `zip` through `calamine` only, which reads an `.xlsx` in memory and never calls `extract` (its 0.36.1 source read). 0.36.1 is `calamine`'s latest release and requires `zip` 8. Decision (owner, 2026-10-17): release with them open, as FLOW-019's unreachable advisories were watched; each `/dep-audit` re-checks for a `calamine` on `zip` 9 and the agent bumps it then.

**Size:** S

**Waits on the owner:** no

**Re-checked 2026-10-18:** `zip` 9.0.5 is out; `calamine` is still 0.36.1 on crates.io, so the advisories still wait on it; unreached.
