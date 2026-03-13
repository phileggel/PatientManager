# PatientManager

Patient and service management system for desktop - manage patient records, track services, reconcile reimbursements, and analyze revenue.

## Quick Start

### Prerequisites

- **Node.js**: https://nodejs.org
- **Rust**: https://rustup.rs

(See `package.json` and `src-tauri/Cargo.toml` for version requirements)

### Setup

```bash
git clone <repository-url>
cd ProjectSF
npm install
```

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

Proprietary / Non-commercial

---

Created January 2026 for patient and service management.
