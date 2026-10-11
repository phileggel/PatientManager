# TODO-023 — (frontend + backend/diagnostic-report) — Report a problem from the error that shows it

Draft from the owner's words (chat, 2026-10-11), to confirm: "a kind of button to create a bug report that I can send". A diagnostic report exists since 0.24.0 (DGR): a text file with the version, the database checks, the row counts and the last 200 backend log lines, generated from the backup dialog, sending nothing. On 2026-10-10 it was not used: it sits three clicks away from an error, 200 backend lines would not have covered two attempts, the frontend's lines are absent, and the document being imported — which settled the diagnosis — is never part of it.

**Size:** L — a spec change with the owner, then frontend and backend.

**User value:** when something fails, the user produces in one gesture what the maintainer needs to understand it, and knows exactly what it contains.

**Done when:** (draft) an error message offers a "report this problem" action that generates the diagnostic report without leaving the screen; the report holds enough of the log to cover the failed action, frontend lines included; attaching the document being imported is a separate, optional step that says the document contains patient data; nothing is sent by the application (DGR-024 holds); the spec and its tests carry the rules.

**Design:** needed — mocks before anything is built.

**Open questions:**

- [ ] The owner confirms this entry: it is a draft.
- [ ] Is this one feature with the encrypted support bundle and its upload (DEBT-024), or a first step before it?
- [ ] May the document be attached at all, since it holds patient data — and if so, how is it protected on its way to the maintainer?
- [ ] How much of the log: a number of lines, or everything since the failed action started?
- [ ] It depends on DEBT-051: the report promises no patient data, and a fund label can carry a name into the log today.
