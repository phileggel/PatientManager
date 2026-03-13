#!/bin/bash

# Complete quality check for Tauri App
# Runs all tests, linting, and formatting checks
# Provides a Quality Metrics report for PR submission

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
ORANGE='\033[0;33m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Metrics initialization
REACT_TESTS=0
RUST_LIB_TESTS=0
RUST_BEHAVIOR_TESTS=0
OXLINT_ERRORS=0
OXLINT_TEST_ERRORS=0
BIOME_ERRORS=0
BUILD_OK=true
CLIPPY_OK=true
RUST_FMT_OK=true
TSC_ERRORS=0

VERBOSE=false
SUITE_FAILED=false
FAST_MODE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --verbose) VERBOSE=true; shift ;;
    --fast) FAST_MODE=true; shift ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

print_header() {
  echo -e "\n${BLUE}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

# --- Section Tests & Build (Skip if FAST_MODE) ---
if [ "$FAST_MODE" = false ]; then
  print_header "🧪 Running Tests"
  
  # React Tests
  if cd "$PROJECT_ROOT" && npm test 2>&1 | tee /tmp/react_test.log > /dev/null; then
    REACT_TESTS=$(grep -oP '[0-9]+\s+passed' /tmp/react_test.log | grep -oP '[0-9]+' | tail -1 || echo "0")
    echo -e "${GREEN}✓ React Tests: $REACT_TESTS passed${NC}"
  else
    SUITE_FAILED=true
    echo -e "${RED}✗ React Tests failed${NC}"
  fi

  # Rust Lib
  if cd "$PROJECT_ROOT/src-tauri" && cargo test --lib 2>&1 | tee /tmp/rust_lib_test.log > /dev/null; then
    RUST_LIB_TESTS=$(grep -oP 'test result: ok\.\s+\K[0-9]+(?=\s+passed)' /tmp/rust_lib_test.log | tail -1 || echo "0")
    echo -e "${GREEN}✓ Rust Lib Tests: $RUST_LIB_TESTS passed${NC}"
  else
    SUITE_FAILED=true
    echo -e "${RED}✗ Rust Lib Tests failed${NC}"
  fi

  # Rust Behavior
  if cd "$PROJECT_ROOT/src-tauri" && cargo test --tests 2>&1 | tee /tmp/rust_test_test.log > /dev/null; then
    RUST_BEHAVIOR_TESTS=$(grep -oP 'test result: ok\.\s+\K[0-9]+(?=\s+passed)' /tmp/rust_test_test.log | tail -1 || echo "0")
    echo -e "${GREEN}✓ Rust Behavior Tests: $RUST_BEHAVIOR_TESTS passed${NC}"
  else
    SUITE_FAILED=true
    echo -e "${RED}✗ Rust Behavior Tests failed${NC}"
  fi

  print_header "🏗️  Building Application"
  if cd "$PROJECT_ROOT" && npm run build > /tmp/build.log 2>&1; then
    echo -e "${GREEN}✓ Build succeeded${NC}"
  else
    BUILD_OK=false
    SUITE_FAILED=true
    echo -e "${RED}✗ Build failed${NC}"
  fi
else
  echo -e "${YELLOW}⏩ Fast mode: Skipping Tests and Build...${NC}"
fi

# --- Section Linting ---
print_header "🔍 Running Linting & Formatting Checks"

# Oxlint
OXLINT_OUTPUT=$(cd "$PROJECT_ROOT" && npm run lint 2>&1 || echo "Found 0 errors")
OXLINT_ERRORS=$(echo "$OXLINT_OUTPUT" | grep -oP 'Found \K[0-9]+(?=\s+warnings and)' || echo "0")
if [ "$OXLINT_ERRORS" != "0" ]; then
  SUITE_FAILED=true
  echo -e "${RED}✗ Oxlint: $OXLINT_ERRORS warnings${NC}"
  echo "$OXLINT_OUTPUT" | head -20
  [ "$VERBOSE" = true ] && echo "$OXLINT_OUTPUT"
fi

# Biome
if cd "$PROJECT_ROOT" && npm run format > /tmp/biome.log 2>&1; then
  BIOME_ERRORS=0
else
  BIOME_OUTPUT=$(cat /tmp/biome.log)
  BIOME_ERRORS=$(echo "$BIOME_OUTPUT" | grep -oP 'Found \K[0-9]+(?=\s+errors?)' | head -1 || echo "1")
  SUITE_FAILED=true
  echo -e "${RED}✗ Biome: $BIOME_ERRORS errors${NC}"
  echo "$BIOME_OUTPUT" | head -20
  [ "$VERBOSE" = true ] && echo "$BIOME_OUTPUT"
fi

# Clippy
CLIPPY_OUTPUT=$(cd "$PROJECT_ROOT/src-tauri" && cargo clippy --all-targets -- -D warnings 2>&1 || echo "CLIPPY_FAILED")
if echo "$CLIPPY_OUTPUT" | grep -q "CLIPPY_FAILED\|warning:\|error:"; then
  CLIPPY_OK=false
  SUITE_FAILED=true
  echo -e "${RED}✗ Clippy: issues found${NC}"
  echo "$CLIPPY_OUTPUT" | grep -A 3 "warning:\|error:" | head -20
  [ "$VERBOSE" = true ] && echo "$CLIPPY_OUTPUT"
fi

# Cargo Fmt
if cd "$PROJECT_ROOT/src-tauri" && cargo fmt --check 2>&1; then
  echo -e "${GREEN}✓ Cargo Fmt: Pass${NC}"
else
  RUST_FMT_OK=false
  SUITE_FAILED=true
  echo -e "${RED}✗ Cargo Fmt: formatting issues found${NC}"
fi

# --- Section TypeScript (Non-blocking) ---
echo -e "\n${YELLOW}Running TypeScript Check...${NC}"
# English: Capture TSC errors without stopping the script
TSC_OUTPUT=$(cd "$PROJECT_ROOT" && npx tsc --noEmit 2>&1 || true)
TSC_ERRORS=$(echo "$TSC_OUTPUT" | { grep "error TS" || true; } | wc -l | tr -d ' ')

# ============================================================================
# QUALITY METRICS REPORT
# ============================================================================
print_header "📊 Quality Metrics Report"

get_status() {
  local name=$1
  local value=$2
  local display_text=""
  local icon=""
  local color=""

  # 1. Check Fast Mode
  if [ "${FAST_MODE:-false}" = true ]; then
    case $name in
      react|rust_lib|rust_beh|build)
        display_text="SKIPPED"
        icon="⏩"
        color="$YELLOW"
        ;;
    esac
  fi

  # 2. Determine Status if not skipped
  if [ -z "$display_text" ]; then
    if [ "$value" = "warn" ]; then
      display_text="$TSC_ERRORS errors"
      icon="⚠️ "
      color="$ORANGE"
    elif [ "$value" = "Fail" ] || [ "$value" = "false" ] || [ -z "$value" ] || [ "$value" = "0 errors" ]; then
      # English: Special case for Biome/Oxlint where 0 errors is actually a Pass
      if [[ "$value" == "0"* ]]; then
        display_text="Pass"
        icon="✅"
        color="$GREEN"
      else
        display_text="Fail"
        icon="❌"
        color="$RED"
      fi
    else
      display_text="$value"
      icon="✅"
      color="$GREEN"
    fi
  fi

  # 3. Print formatted line
  echo -ne "${icon} "
  echo -ne "${color}"
  printf "%-28s" "$display_text"
  echo -e "${NC} |"
}

# Build conditional row for Rust Behavior Tests (only if count > 0)
BEHAVIOR_TESTS_ROW=""
if [ "$RUST_BEHAVIOR_TESTS" -gt 0 ]; then
  BEHAVIOR_TESTS_ROW="| Rust Behavior Tests| $(get_status "rust_beh" "${RUST_BEHAVIOR_TESTS:+$RUST_BEHAVIOR_TESTS passing}")"$'\n'
fi

cat << EOF
| Check              | Status                          |
|:-------------------|:--------------------------------|
| React Tests        | $(get_status "react" "${REACT_TESTS:+$REACT_TESTS passing}")
| Rust Lib Tests     | $(get_status "rust_lib" "${RUST_LIB_TESTS:+$RUST_LIB_TESTS passing}")
${BEHAVIOR_TESTS_ROW}| Build Application  | $(get_status "build" "$([ "$BUILD_OK" = true ] && echo "Pass" || echo "Fail")")
| Oxlint (main)      | $(get_status "lint" "$OXLINT_ERRORS warnings")
| Biome              | $(get_status "biome" "$BIOME_ERRORS errors")
| Clippy (all)       | $(get_status "clippy" "$([ "$CLIPPY_OK" = true ] && echo "Pass" || echo "Fail")")
| Rust Fmt           | $(get_status "rust_fmt" "$([ "$RUST_FMT_OK" = true ] && echo "Pass" || echo "Fail")")
| TypeScript (tsc)   | $(get_status "tsc" "$([ "$TSC_ERRORS" -eq 0 ] && echo "Pass" || echo "warn")")
EOF

echo ""

# Exit logic
if [ "$SUITE_FAILED" = true ]; then
  echo -e "${RED}❌ Quality check FAILED${NC}\n"
  exit 1
else
  echo -e "${GREEN}✨ All quality checks PASSED${NC}\n"
  exit 0
fi