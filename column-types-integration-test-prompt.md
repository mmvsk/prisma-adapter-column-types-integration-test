# Task: Integration Test for columnTypes Flow

Working directory: `/home/rmx/tmp/column-types-test` (new repo to create)

## Objective

Create a standalone integration test repository to verify that `columnTypes` flows correctly from the Query Compiler (WASM) through to Driver Adapters, specifically testing the SQLite `timestampFormat: "unixepoch-ms"` use case where DateTime fields are stored as INTEGER.

## Context

Two PRs have been created:
1. **prisma/prisma** (`feature/28891-sqlquery-column-types`): Added `columnTypes` to `SqlQuery` and `QueryPlanDbQuery`, with pass-through in `renderQuery()`
2. **prisma-engines** (`feature/28891-dbquery-column-types`): Added `column_types` to `DbQuery` enum in the Query Compiler

Now we need to verify the end-to-end flow works with local builds of both repos.

## Architecture Reminder

```
Query Compiler (WASM/Rust)     →  DbQuery.column_types (Rust)
        ↓ (JSON serialization)
QueryPlanDbQuery.columnTypes   →  (TypeScript receives from WASM)
        ↓
renderQuery()                  →  passes through
        ↓
SqlQuery.columnTypes           →  Driver Adapter receives this
```

## Step 1: Build prisma-engines WASM

First, build the WASM query compiler with your changes:

```bash
cd ~/tmp/prisma-engines

# Ensure you're on the right branch
git checkout feature/28891-dbquery-column-types

# Build the WASM query compiler
make build-qc-wasm

# The output will be in query-compiler/query-compiler-wasm/pkg/
ls query-compiler/query-compiler-wasm/pkg/
```

## Step 2: Update prisma to use local WASM

```bash
cd ~/tmp/prisma

# Ensure you're on the right branch
git checkout feature/28891-sqlquery-column-types

# Copy the WASM files from prisma-engines to prisma
# The exact location depends on how prisma loads the WASM
# Check packages/client/src/runtime/core/engines/client/ for WASM loading

# Rebuild prisma packages
pnpm build
```

## Step 3: Create the test repository

```bash
mkdir -p ~/tmp/column-types-test
cd ~/tmp/column-types-test

# Initialize the project
pnpm init

# Create package.json with local dependencies
cat > package.json << 'EOF'
{
  "name": "column-types-test",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "prisma generate",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:run": "tsx src/test.ts"
  },
  "dependencies": {
    "@prisma/client": "file:../prisma/packages/client",
    "@prisma/adapter-better-sqlite3": "file:../prisma/packages/adapter-better-sqlite3",
    "@prisma/driver-adapter-utils": "file:../prisma/packages/driver-adapter-utils",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "prisma": "file:../prisma/packages/cli",
    "tsx": "^4.19.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
EOF
```

## Step 4: Create Prisma schema

```bash
mkdir -p prisma

cat > prisma/schema.prisma << 'EOF'
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = "file:./test.db"
}

model Event {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  timestamp DateTime
}
EOF
```

## Step 5: Create TypeScript config

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src/**/*"]
}
EOF
```

## Step 6: Create the test file

```bash
mkdir -p src

cat > src/test.ts << 'EOF'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3'
import { ColumnTypeEnum, SqlQuery } from '@prisma/driver-adapter-utils'

// Store captured queries
const capturedQueries: SqlQuery[] = []

// Create a wrapper adapter that captures SqlQuery objects
function createCapturingAdapter(db: Database.Database) {
  const baseAdapter = new PrismaBetterSQLite3(db)

  // Wrap queryRaw to capture the SqlQuery
  const originalQueryRaw = baseAdapter.queryRaw.bind(baseAdapter)
  baseAdapter.queryRaw = async (query: SqlQuery) => {
    capturedQueries.push(query)
    console.log('\n📥 Captured SqlQuery:')
    console.log('  SQL:', query.sql.substring(0, 100) + (query.sql.length > 100 ? '...' : ''))
    console.log('  argTypes:', query.argTypes)
    console.log('  columnTypes:', query.columnTypes)
    return originalQueryRaw(query)
  }

  return baseAdapter
}

async function main() {
  console.log('🧪 columnTypes Integration Test\n')
  console.log('='.repeat(50))

  // Setup database
  const db = new Database('prisma/test.db')
  const adapter = createCapturingAdapter(db)

  const prisma = new PrismaClient({
    adapter,
  })

  try {
    // Clean up and setup
    console.log('\n📦 Setting up database...')
    await prisma.$executeRaw`DROP TABLE IF EXISTS Event`
    await prisma.$executeRaw`
      CREATE TABLE Event (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `

    // Insert test data
    console.log('\n📝 Creating test event...')
    capturedQueries.length = 0 // Clear previous queries

    const now = new Date()
    const event = await prisma.event.create({
      data: {
        name: 'Test Event',
        timestamp: now,
      },
    })
    console.log('Created event:', event)

    // Query the data back
    console.log('\n🔍 Querying events...')
    capturedQueries.length = 0 // Clear previous queries

    const events = await prisma.event.findMany()
    console.log('Found events:', events)

    // Analyze captured queries
    console.log('\n' + '='.repeat(50))
    console.log('📊 Analysis of captured queries:\n')

    let hasColumnTypes = false
    let hasDateTimeType = false

    for (const query of capturedQueries) {
      if (query.columnTypes) {
        hasColumnTypes = true
        console.log('✅ Query has columnTypes:', query.columnTypes)

        // Check if DateTime type (10) is present
        if (query.columnTypes.includes(ColumnTypeEnum.DateTime)) {
          hasDateTimeType = true
          console.log('✅ Found DateTime type hint in columnTypes!')
        }
      } else {
        console.log('❌ Query missing columnTypes')
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log('📋 Test Results:\n')
    console.log(`  columnTypes present: ${hasColumnTypes ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`  DateTime type hint:  ${hasDateTimeType ? '✅ PASS' : '❌ FAIL'}`)

    if (hasColumnTypes && hasDateTimeType) {
      console.log('\n🎉 Integration test PASSED!')
    } else {
      console.log('\n💥 Integration test FAILED!')
      console.log('\nPossible issues:')
      if (!hasColumnTypes) {
        console.log('  - Query Compiler (WASM) may not be emitting column_types')
        console.log('  - Check prisma-engines build is up to date')
      }
      if (!hasDateTimeType) {
        console.log('  - DateTime fields not being mapped to ColumnType.DateTime')
      }
    }

  } finally {
    await prisma.$disconnect()
    db.close()
  }
}

main().catch(console.error)
EOF
```

## Step 7: Install and run

```bash
cd ~/tmp/column-types-test

# Install dependencies (will use local prisma packages)
pnpm install

# Generate Prisma client
pnpm generate

# Run the test
pnpm test:run
```

## Expected Output

**If working correctly:**
```
🧪 columnTypes Integration Test

==================================================

📦 Setting up database...

📝 Creating test event...

📥 Captured SqlQuery:
  SQL: INSERT INTO Event ...
  argTypes: [...]
  columnTypes: [0, 7, 10, 10, 10]  // Int32, Text, DateTime, DateTime, DateTime

Created event: { id: 1, name: 'Test Event', createdAt: 2024-..., ... }

🔍 Querying events...

📥 Captured SqlQuery:
  SQL: SELECT ... FROM Event ...
  argTypes: []
  columnTypes: [0, 7, 10, 10, 10]  // Int32, Text, DateTime, DateTime, DateTime

==================================================
📋 Test Results:

  columnTypes present: ✅ PASS
  DateTime type hint:  ✅ PASS

🎉 Integration test PASSED!
```

**If not working (current state before prisma-engines populates values):**
```
📥 Captured SqlQuery:
  SQL: SELECT ... FROM Event ...
  argTypes: []
  columnTypes: undefined

==================================================
📋 Test Results:

  columnTypes present: ❌ FAIL
  DateTime type hint:  ❌ FAIL

💥 Integration test FAILED!
```

## Troubleshooting

### WASM not loading
If you get errors about WASM, ensure:
1. prisma-engines WASM was built: `make build-qc-wasm`
2. The WASM files are in the right location in prisma
3. prisma was rebuilt after copying WASM: `pnpm build`

### Local packages not linking
If pnpm can't find local packages:
```bash
# Alternative: use pnpm link
cd ~/tmp/prisma/packages/client && pnpm link --global
cd ~/tmp/prisma/packages/cli && pnpm link --global
cd ~/tmp/prisma/packages/adapter-better-sqlite3 && pnpm link --global
cd ~/tmp/prisma/packages/driver-adapter-utils && pnpm link --global

cd ~/tmp/column-types-test
pnpm link --global @prisma/client prisma @prisma/adapter-better-sqlite3 @prisma/driver-adapter-utils
```

### Type errors
If you get TypeScript errors about SqlQuery.columnTypes:
- Ensure driver-adapter-utils was rebuilt
- Check that the types are exported correctly

## Cleanup

```bash
rm -rf ~/tmp/column-types-test/prisma/test.db
rm -rf ~/tmp/column-types-test/node_modules
```

## Summary

This test:
1. Creates a capturing wrapper around the driver adapter
2. Intercepts `queryRaw` calls to inspect `SqlQuery` objects
3. Verifies `columnTypes` is present and contains `DateTime` type hints
4. Reports pass/fail status

The test will initially FAIL until prisma-engines Query Compiler is updated to actually populate `column_types` values (currently it just adds the field but sets it to `None`).
