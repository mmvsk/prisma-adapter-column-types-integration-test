# columnTypes Integration Test

This integration test verifies that `columnTypes` flows correctly from the Query Compiler (Rust/WASM) through to Driver Adapters in Prisma.

## Purpose

This test proves that the double PR for `prisma/prisma` and `prisma/prisma-engines` works correctly:
- **prisma-engines**: Adds `column_types` field to `DbQuery` enum and populates it via `extract_column_types()`
- **prisma**: Adds TypeScript plumbing to pass `columnTypes` through `SqlQuery` to driver adapters

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust toolchain with `wasm32-unknown-unknown` target
- wasm-bindgen-cli (matching version used by prisma-engines)

## Repository Structure

```
prisma-column-types/
├── prisma/                  # Fork of prisma/prisma
├── prisma-engines/          # Fork of prisma/prisma-engines
└── integration-test/        # This test project
```

## Setup Instructions

### 1. Clone the repositories

```bash
mkdir prisma-column-types && cd prisma-column-types

# Clone your prisma fork (with columnTypes TypeScript changes)
git clone https://github.com/YOUR_USERNAME/prisma.git
cd prisma
git checkout feature/28891-sqlquery-column-types
pnpm install
cd ..

# Clone your prisma-engines fork (with column_types Rust changes)
git clone https://github.com/YOUR_USERNAME/prisma-engines.git
cd prisma-engines
git checkout feature/prisma-28891-dbquery-column-types
cd ..

# Clone or create the integration test
git clone https://github.com/YOUR_USERNAME/prisma-column-types-integration-test.git integration-test
cd integration-test
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

### 3. Build WASM from prisma-engines

```bash
cd prisma-engines

# Ensure cargo bin is in PATH (wasm-bindgen-cli)
export PATH="$HOME/.cargo/bin:$PATH"

# Build all WASM targets
make build-qc-wasm

cd ..
```

This creates WASM files in `prisma-engines/query-compiler/query-compiler-wasm/pkg/`.

### 4. Copy WASM to prisma

Find the query-compiler-wasm package location in prisma's node_modules:

```bash
# Find the exact path (version may vary)
QCW_PATH=$(find prisma/node_modules -type d -name "@prisma+query-compiler-wasm*" | head -1)/node_modules/@prisma/query-compiler-wasm

# Copy SQLite WASM (or other providers as needed)
cp prisma-engines/query-compiler/query-compiler-wasm/pkg/sqlite/query_compiler_bg.wasm \
   "$QCW_PATH/sqlite/query_compiler_bg.wasm"

cp prisma-engines/query-compiler/query-compiler-wasm/pkg/sqlite/query_compiler_bg.js \
   "$QCW_PATH/sqlite/query_compiler_bg.js"
```

### 5. Rebuild prisma client package

```bash
cd prisma
pnpm --filter @prisma/client build
cd ..
```

### 6. Install integration test dependencies

```bash
cd integration-test
pnpm install
```

The `package.json` uses pnpm overrides to link local prisma packages:

```json
{
  "pnpm": {
    "overrides": {
      "@prisma/client": "link:../prisma/packages/client",
      "@prisma/client-engine-runtime": "link:../prisma/packages/client-engine-runtime",
      "@prisma/client-runtime-utils": "link:../prisma/packages/client-runtime-utils",
      "@prisma/driver-adapter-utils": "link:../prisma/packages/driver-adapter-utils",
      "@prisma/adapter-better-sqlite3": "link:../prisma/packages/adapter-better-sqlite3",
      "prisma": "link:../prisma/packages/cli"
    }
  }
}
```

### 7. Generate Prisma Client and run tests

```bash
# Generate the Prisma client
pnpm generate

# Run the integration test
pnpm test:run

# Run the mock test (TypeScript types only)
pnpm test:mock

# Run both tests
pnpm test:all
```

## Expected Output

### Integration Test (pnpm test:run)

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

### Mock Test (pnpm test:mock)

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

## How It Works

1. **Query Compiler (WASM)**: When building a query, `extract_column_types()` maps each selected field's Prisma type to a `ColumnType` enum value.

2. **Serialization**: The `column_types` field is serialized as a JSON array of numbers (e.g., `[0, 7, 10, 10, 10]`).

3. **TypeScript Runtime**: The `renderQuery()` function passes `columnTypes` from `QueryPlanDbQuery` to `SqlQuery`.

4. **Driver Adapter**: The adapter receives `SqlQuery.columnTypes` and can use it to correctly convert result values (e.g., INTEGER to Date for DateTime fields).

## Troubleshooting

### "columnTypes: undefined"

If `columnTypes` is undefined, the WASM wasn't rebuilt or copied correctly:

1. Verify WASM was built: `ls -la prisma-engines/query-compiler/query-compiler-wasm/pkg/sqlite/`
2. Verify WASM was copied to prisma's query-compiler-wasm package
3. Rebuild @prisma/client: `pnpm --filter @prisma/client build`
4. Regenerate: `pnpm generate`

### Module resolution errors

If you get "Cannot find module" errors:

1. Ensure all pnpm overrides are correct in `package.json`
2. Run `pnpm install` again
3. Check that prisma packages are built: `cd ../prisma && pnpm build`

### wasm-bindgen version mismatch

If WASM build fails with version mismatch:

```bash
# Check required version
grep wasm-bindgen prisma-engines/Cargo.lock | head -5

# Install matching version
cargo install wasm-bindgen-cli --version X.X.X
```

## Files

- `src/test.ts` - Main integration test that captures SqlQuery objects
- `src/mock-test.ts` - TypeScript type verification test
- `prisma/schema.prisma` - Test schema with DateTime fields
- `prisma.config.ts` - Prisma 7.x configuration

## Related PRs

- prisma/prisma#XXXXX - TypeScript columnTypes plumbing
- prisma/prisma-engines#XXXXX - Rust column_types implementation
