# Kit version

claude-kit **v4.17.0** — synced 2026-05-31

## Changes since v4.13.0 (your previous sync)

- v4.17.0: add agent/skill design gold standard; replace Step 1 discovery pipeline with filter; replace run-pipelines with Glob/Grep tool calls; add When-to-use, correct idempotency claim; remove unused retro-spec, scope tools-walk; fold branch-files/changed-files into branch.sh files
- v4.16.0: hand caller a verification path on stale claims; add session-reflect end-of-session skill; refuse svelte-lineage tags cleanly
- v4.15.0: training-cutoff humility rule (gh#67); add --strict release-time enforcement; guard npm format recipes for partial-stack; detect md format drift in --fast (gh#68); extract \_frontend_npm_check_step helper
- v4.14.0: lint workflow-checklist skills require TaskCreate (gh#62); F28 store-kind table + F26 promotion target (gh#63); F26 cross-feature store import detector (gh#64); make TaskCreate explicit Step 5 (gh#62)
