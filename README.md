# PatientManager

![CI](https://github.com/phileggel/PatientManager/actions/workflows/ci.yml/badge.svg)
[![coverage](https://img.shields.io/codecov/c/github/phileggel/PatientManager?label=coverage)](https://codecov.io/gh/phileggel/PatientManager)
[![frontend](https://img.shields.io/codecov/c/github/phileggel/PatientManager?flag=frontend&label=frontend)](https://codecov.io/gh/phileggel/PatientManager?flags=frontend)
[![backend](https://img.shields.io/codecov/c/github/phileggel/PatientManager?flag=backend&label=backend)](https://codecov.io/gh/phileggel/PatientManager?flags=backend)

Patient and service management system for desktop - manage patient records, track services, reconcile reimbursements, and analyze revenue.

## Quick Start

### Setup (Linux)

The steps below bootstrap a fresh machine end-to-end. Run them in order.

**1. System libraries (Tauri Linux build deps — requires sudo)**

```bash
sudo apt update && sudo apt install -y pkgconf libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev libssl-dev libayatana-appindicator3-dev libxdo-dev
```

(On Ubuntu 22.04 and earlier, replace `pkgconf` with `pkg-config`.)

**2. Rust toolchain (user-local)**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --component clippy rustfmt
. "$HOME/.cargo/env"
```

**3. `just` task runner + `sqlx-cli`**

```bash
cargo install just
cargo install sqlx-cli --no-default-features --features sqlite
```

**4. Node.js via nvm (user-local)**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. "$HOME/.nvm/nvm.sh"
nvm install --lts
nvm use --lts
```

**5. Clone and install project deps**

```bash
git clone <repository-url>
cd PatientManager
npm install
```

**6. Verify**

```bash
just check-full
```

This runs lint + format + typecheck + tests for both backend and frontend. If it goes green, the environment is ready.

(Version requirements: `package.json` and `src-tauri/Cargo.toml`. macOS/Windows: install Rust via https://rustup.rs and Node via https://nodejs.org; system-library step is Linux-only.)

### E2E Setup (optional)

End-to-end tests drive the running Tauri app via WebDriver. The repo already includes `wdio.conf.ts`, the `e2e/` suites, and the `test:e2e` / `test:e2e:ci` npm scripts; the steps below add the runtime pieces a clean machine is missing.

**1. WebDriver runtime (system + cargo)**

```bash
sudo apt install -y webkit2gtk-driver xvfb
cargo install tauri-driver --locked
```

`webkit2gtk-driver` provides `WebKitWebDriver`; `xvfb` is required by the headless `test:e2e:ci` script.

**2. Run the suite**

```bash
npm run test:e2e      # interactive
npm run test:e2e:ci   # headless (uses xvfb-run)
```

See `docs/e2e-rules.md` for the selector and aria-label conventions tests rely on.

### Development

```bash
./scripts/start-app.sh          # Linux/macOS
scripts\start-app.bat           # Windows
```

App opens automatically with hot reload.

### Build

```bash
./scripts/build.sh              # Linux/macOS
npm run tauri:build             # Or directly
```

Output: `src-tauri/target/release/bundle/`

## Code Quality

### Testing

Run tests with:
```bash
npm run test
```

Tests are run with Vitest using React Testing Library for component testing.

### Linting

This project uses two complementary linters to ensure code quality across the full stack:

#### Frontend Linting with Oxlint

Oxlint is a Rust-based JavaScript/TypeScript linter offering 50-100x faster performance than traditional JavaScript linters.

```bash
# Check frontend code
npm run lint

# Auto-fix issues
npm run lint:fix
```

**Configuration:** `.oxlintrc.json`

#### Backend Linting with Clippy

Clippy is the standard Rust linter for catching common mistakes and improving code quality.

```bash
# Check Rust code
cd src-tauri
cargo clippy -- -D warnings
```

**Configuration:** `src-tauri/clippy.toml`

### Why Two Linters?

- **Oxlint** - Extremely fast zero-config JavaScript/TypeScript linting with 520+ ESLint-compatible rules
- **Clippy** - Comprehensive Rust linting integrated with the Rust toolchain

Both linters catch issues early and maintain consistent code standards across frontend and backend.

## Documentation

### Business & Product
- [Roadmap](docs/business/ROADMAP.md) - Feature planning and development phases

### Development & Technical
- [Architecture](docs/development/architecture.md) - System design, structure, and data flow
- [Commit Policy & Versioning](COMMIT_POLICY.md) - Commit standards, versioning, and release process
- [Contributing](CONTRIBUTING.md) - How to contribute
- [Testing](docs/development/testing.md) - Testing strategy and guidelines

## Troubleshooting

### "Command not found"
Rust backend not compiled:
```bash
cd src-tauri && cargo build
```

### Blank window
Frontend failed to build:
```bash
npm install && npm run build
```

### Port 5173 in use
```bash
# Linux/macOS
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use different port
VITE_PORT=5174 npm run tauri:dev
```

## Resources

- [Tauri Docs](https://tauri.app/)
- [React Docs](https://react.dev)
- [Rust Docs](https://doc.rust-lang.org/)

## License

MIT © [Philippe Eggel](https://github.com/phileggel)

---

Created January 2026 by Philippe Eggel for patient and service management.
