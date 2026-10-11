# FLOW-050 — `just queue new` splits the title it is given

- Kind: quality
- Size: S
- Observed: on 2026-10-11 the first use of the command documented that day (#247),
  `just queue new flow "The audit counts …"`, answered with the script's usage line and
  exit 2: the `queue *ARGS` recipe of the `justfile` passes `{{ARGS}}` unquoted, so a
  title of several words reaches the script as several arguments. The script's own tests
  pass, since they call it without the recipe; the reviewer read the recipe as passing
  the arguments through. This entry and FLOW-049 were filed by calling
  `python3 scripts/work-queue.py new` directly.
- Proposal: the recipe passes its arguments as they were given
  (`set positional-arguments` and `"$@"` for this recipe), and a test runs the recipe
  itself with a title of several words, in a throwaway copy.
- Costs: a few lines in the `justfile`, one test that needs `just` installed where the
  script tests run. Until then `/file-entry` and `docs/workflow.md` § 2 name a command
  that fails on any title of more than one word.
- Added 2026-10-11 (release sweep): `/file-entry` step 2 names the failing command; six entries
  were filed since by calling the script directly.
