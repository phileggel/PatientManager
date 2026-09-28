# Contributing

1. Install [just](https://github.com/casey/just#installation), then activate the git hooks:

   ```bash
   git config core.hooksPath .githooks
   ```

2. Run the app with `just dev`. `just --list` shows every recipe.
3. Before opening a pull request, run `just harness` — the same checks CI requires.

Where things are: [docs/README.md](docs/README.md). How a change goes from task to
merge: [docs/workflow.md](docs/workflow.md). Commit messages:
[docs/commit-rules.md](docs/commit-rules.md).
