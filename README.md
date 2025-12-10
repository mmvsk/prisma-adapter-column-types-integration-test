# Prisma Adapter Column Types - Integration Test

This repository contains a self-contained integration test for the `columnTypes` feature that adds type hints to Prisma's driver adapters.

Related issue: [prisma/prisma#28891](https://github.com/prisma/prisma/issues/28891)

## Overview

The `columnTypes` feature adds a new field to `SqlQuery` that provides type hints for each column in query results. This enables driver adapters to correctly convert database values (e.g., INTEGER to JavaScript Date for DateTime fields in SQLite).

This test verifies the end-to-end flow:
1. **prisma-engines**: Adds `column_types` field to `DbQuery` and populates it via `extract_column_types()`
2. **prisma**: Adds TypeScript plumbing to pass `columnTypes` through `SqlQuery` to driver adapters

## Repository Structure

```
.
├── README.md                    # This file
├── prisma/                      # Git submodule: fork of prisma/prisma
├── prisma-engines/              # Git submodule: fork of prisma/prisma-engines
└── test/                        # Integration test project
    ├── src/
    │   ├── test.ts              # Main integration test
    │   └── mock-test.ts         # TypeScript type verification
    ├── prisma/
    │   └── schema.prisma        # Test schema
    ├── package.json
    └── README.md                # Detailed test documentation
```

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Rust** toolchain (for building WASM)
- **wasm32-unknown-unknown** target
- **wasm-bindgen-cli** (matching version used by prisma-engines)

## Quick Start

### 1. Clone the repository with submodules

```bash
git clone --recurse-submodules --shallow-submodules https://github.com/mmvsk/prisma-adapter-column-types-integration-test.git
cd prisma-adapter-column-types-integration-test
```

The `--shallow-submodules` flag uses `--depth 1` for submodules, which is much faster since prisma and prisma-engines have large histories.

Or if you already cloned without submodules:

```bash
git submodule update --init --depth 1
```

### 2. Install Rust WASM toolchain

```bash
# Install wasm32 target
rustup target add wasm32-unknown-unknown

# Check wasm-bindgen version required by prisma-engines
grep wasm-bindgen prisma-engines/Cargo.lock | head -5

# Install matching wasm-bindgen-cli (e.g., 0.2.105)
cargo install wasm-bindgen-cli --version 0.2.105
```

### 3. Build the prisma monorepo

```bash
cd prisma
pnpm install
pnpm build
cd ..
```

### 4. Build WASM from prisma-engines

```bash
cd prisma-engines

# Ensure cargo bin is in PATH
export PATH="$HOME/.cargo/bin:$PATH"

# Build all WASM targets
make build-qc-wasm

cd ..
```

### 5. Copy WASM to prisma

```bash
# Find the query-compiler-wasm package path
QCW_PATH=$(find prisma/node_modules -type d -name "@prisma+query-compiler-wasm*" 2>/dev/null | head -1)/node_modules/@prisma/query-compiler-wasm

# Copy SQLite WASM
cp prisma-engines/query-compiler/query-compiler-wasm/pkg/sqlite/query_compiler_bg.wasm \
   "$QCW_PATH/sqlite/query_compiler_bg.wasm"

cp prisma-engines/query-compiler/query-compiler-wasm/pkg/sqlite/query_compiler_bg.js \
   "$QCW_PATH/sqlite/query_compiler_bg.js"
```

### 6. Rebuild @prisma/client

```bash
cd prisma
pnpm --filter @prisma/client build
cd ..
```

### 7. Install and run the integration test

```bash
cd test
pnpm install
pnpm generate
pnpm test:all
```

## Expected Output

### Integration Test (`pnpm test:run`)

```
columnTypes Integration Test
============================================================

[1] Setting up database...
    Database ready with Event table (DateTime as INTEGER)

[2] Creating test event...
    columnTypes: [0,7,10,10,10]
    Created: { id: 1, name: 'Test Event' }

[3] Querying events...
    columnTypes: [0,7,10,10,10]
    Found: 1 event(s)

============================================================
Test Results:
============================================================
  columnTypes present: PASS
  DateTime type hint:  PASS

  Integration test PASSED!
  The columnTypes flow from Query Compiler to Driver Adapter works.
```

### Mock Test (`pnpm test:mock`)

```
columnTypes Mock Test (TypeScript Types)
============================================================

[1] ColumnTypeEnum values:
  PASS: Int32 = 0
  PASS: Int64 = 1
  PASS: Text = 7
  PASS: DateTime = 10
  ...

============================================================
Mock Test Summary:
============================================================
  All TypeScript types for columnTypes are correctly defined.
```

## columnTypes Mapping

The test uses an `Event` model with these fields:

| Field       | Prisma Type | ColumnType | Value |
|-------------|-------------|------------|-------|
| id          | Int         | Int32      | 0     |
| name        | String      | Text       | 7     |
| createdAt   | DateTime    | DateTime   | 10    |
| updatedAt   | DateTime    | DateTime   | 10    |
| timestamp   | DateTime    | DateTime   | 10    |

## Troubleshooting

### "columnTypes: undefined"

If `columnTypes` is undefined, the WASM wasn't rebuilt or copied correctly:

1. Verify WASM was built: `ls -la prisma-engines/query-compiler/query-compiler-wasm/pkg/sqlite/`
2. Verify WASM was copied to prisma's query-compiler-wasm package
3. Rebuild @prisma/client: `cd prisma && pnpm --filter @prisma/client build`
4. Regenerate: `cd test && pnpm generate`

### Module resolution errors

If you get "Cannot find module" errors:

1. Ensure all pnpm overrides are correct in `test/package.json`
2. Run `pnpm install` again in the test directory
3. Check that prisma packages are built: `cd prisma && pnpm build`

### wasm-bindgen version mismatch

If WASM build fails with version mismatch:

```bash
# Check required version
grep wasm-bindgen prisma-engines/Cargo.lock | head -5

# Install matching version
cargo install wasm-bindgen-cli --version X.X.X
```

### Submodule issues

If submodules aren't on the correct branches:

```bash
# Check submodule status
git submodule status

# Update to tracked branches
git submodule update --remote

# Or manually checkout the correct branches
cd prisma && git checkout feature/28891-adapter-column-types && cd ..
cd prisma-engines && git checkout feature/prisma-28891-adapter-column-types && cd ..
```

## How It Works

1. **Query Compiler (WASM)**: When building a query, `extract_column_types()` maps each selected field's Prisma type to a `ColumnType` enum value.

2. **Serialization**: The `column_types` field is serialized as a JSON array of numbers (e.g., `[0, 7, 10, 10, 10]`).

3. **TypeScript Runtime**: The `renderQuery()` function passes `columnTypes` from `QueryPlanDbQuery` to `SqlQuery`.

4. **Driver Adapter**: The adapter receives `SqlQuery.columnTypes` and can use it to correctly convert result values (e.g., INTEGER to Date for DateTime fields).

## Related Links

- [Issue: prisma/prisma#28891](https://github.com/prisma/prisma/issues/28891)
- [Fork: mmvsk/prisma](https://github.com/mmvsk/prisma/tree/feature/28891-adapter-column-types)
- [Fork: mmvsk/prisma-engines](https://github.com/mmvsk/prisma-engines/tree/feature/prisma-28891-adapter-column-types)

## License

This integration test is provided for testing purposes related to the Prisma columnTypes feature.
