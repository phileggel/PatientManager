# ADR 009 — Soft delete leaves the project table by table, bank statement labels first

**Date**: 2026-11-02
**Status**: Accepted — supersedes ADR-001

## Context

ADR-001 recorded three choices for storing bank statement labels (`BankFundLabelMapping`): how a rejected label is stored, how a save avoids duplicates, and soft delete with a uniqueness index over live rows. ADR-001 made soft delete the pattern of the project, with no exception.

The owner decided on 2026-11-01 that soft delete causes more problems than it solves and leaves the project progressively (plan on ticket #579). A soft-deleted row keeps its foreign keys and can stop a real delete with nothing on screen to explain it. It is neither a history nor an undo: no date or reason is kept, and no screen or command brings a row back. Labels come first because nothing refers to them.

## Decision

**Soft delete leaves the project table by table.** It is no longer the project's pattern; a table keeps its flag until its own step, and the owner's plan on #579 holds the order and what each table's removal costs.

**Bank statement labels are its first application:** a deleted label is really deleted, and uniqueness of `(account, label)` covers every row.

The two other choices of ADR-001 hold, and are kept here:

- **A rejected label has no fund** (`fund_id` is NULL), with no separate boolean, which could contradict the fund, and no stored sentinel, which the foreign key on the fund would refuse.
- **A save looks the label up, then updates or inserts**, which keeps the row's identifier across saves, unlike `INSERT OR REPLACE`.

**Alternatives considered:** keeping soft delete and fixing each dead end it causes, which leaves the flag and its filters in every query; a retired state with a date, which no screen would use.

## Consequences

- **Pros**: a table that loses the flag has no hidden rows and no read that can forget the filter; a deleted label is simply unknown at the next import.
- **Cons**: a mistaken delete is repaired only from a backup, losing what came after it (accepted by the owner, 2026-11-01); until the last step, some tables are soft-deleted and others not; a table with history, where the flag lets a user retire an entry, loses that, and the owner chose to refuse such a delete.
