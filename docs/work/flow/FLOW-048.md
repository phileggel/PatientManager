# FLOW-048 — A queue is sized by feel: no entry says how big it is

- Kind: quality
- Observed: on 2026-10-11 the owner found the queue of 16 entries too big the day after
  validating it, as on 2026-10-04 and 05 with a queue of 31 (FLOW-029, closed). One line of
  it, FLOW-032, stands for up to 13 pull requests; another, DEBT-052, for a few lines.
  `/whats-next` states a count of pull requests since FLOW-029, estimated at the moment of
  the proposal by the agent that proposes it; nothing is written on the entry, and nothing
  checks the estimate afterwards. In the 0.24.2 batch, DEBT-038 was one line and one pull
  request; FLOW-029 with FLOW-035, 60 lines of documentation, took five CI rounds; the
  refund fix became two pull requests and nine reviews.
- The owner's direction (2026-10-11): the planning skill evaluates the proper dimension of
  a batch, on figures; the work of an entry is evaluated when the entry is filed, like the
  complexity of a ticket.
- Proposal:
  1. A `Size` line on every entry, set when it is filed, defined by facts and not by
     effort — **S**: one pull request, one reviewer lane, nothing from the owner; **M**:
     one pull request over several lanes, or one that changes a spec or a contract;
     **L**: two or three pull requests, or mocks or a spec interview with the owner;
     **XL**: a programme, which cannot be queued before it is sliced.
  2. The agent sets it on a debt or a flow entry; on a todo entry the planning skill
     proposes it and the owner confirms it with the entry. The entries already filed are
     sized once, in the pull request that brings the line.
  3. The planning skill sums the sizes of what it proposes and stops at what the last
     batches merged (`docs/work/audits.md`), saying both figures.
  4. `just flow-audit` counts, for each entry, the pull requests and CI rounds its branches
     took (a branch name carries the entry id) beside its size; the audit names the
     entries that went past their size, and which kinds do so most.
- Filing an entry (owner, 2026-10-11) — the same pull request, since the size is set there:
  1. One command creates an entry, never a hand-written file:
     `just queue new <todo|debt|flow> "<title>"` gives it the next id, the date and the
     required lines of its kind.
  2. Every entry carries, when filed: its evidence (what was seen, where, with a figure or
     a pull request), one observation only, its size, and a line saying whether it waits
     on the owner and for what — so the planning skill lists what needs the owner without
     reading prose.
  3. The agent files debt and flow entries; a todo entry is drafted from the owner's words
     and is not queued before the owner confirms it.
  4. `just rule-homes` fails on an entry that lacks a required line, as it does on a
     misnamed file.
  5. A very small skill, `/file-entry`, holds these rules, so that the agent files an
     entry properly each time; `docs/workflow.md` § 2 stays their home.
- Costs: a line per entry; a few lines in the queue script and the audit script, with
  their tests; one pass over the backlog. A size is still a guess: only the audit's
  comparison makes it better. Protects: a queue cut twice by the owner in each of the
  last two batches.
- Decision (owner, 2026-10-11): accepted and queued, with the flow entries; the filing rules and their
  small skill are part of it.
