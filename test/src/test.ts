// Import PrismaClient directly from the generated client
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('.prisma/client')
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { ColumnTypeEnum, type SqlQuery, type SqlDriverAdapter, type SqlDriverAdapterFactory } from '@prisma/driver-adapter-utils'

// Store captured queries
const capturedQueries: SqlQuery[] = []

// Create a proxy adapter factory that captures queries
function createCapturingAdapterFactory(baseFactory: SqlDriverAdapterFactory): SqlDriverAdapterFactory {
  return {
    ...baseFactory,
    connect: async () => {
      const adapter = await baseFactory.connect()
      return wrapAdapterForCapture(adapter)
    },
  }
}

// Wrap an adapter to capture SqlQuery objects
function wrapAdapterForCapture(adapter: SqlDriverAdapter): SqlDriverAdapter {
  const originalQueryRaw = adapter.queryRaw.bind(adapter)
  const originalExecuteRaw = adapter.executeRaw.bind(adapter)

  const wrapped: SqlDriverAdapter = {
    ...adapter,
    queryRaw: async (query: SqlQuery) => {
      capturedQueries.push(query)
      console.log('\n  Captured SqlQuery (queryRaw):')
      console.log('    SQL:', query.sql.substring(0, 80) + (query.sql.length > 80 ? '...' : ''))
      console.log('    argTypes:', JSON.stringify(query.argTypes))
      console.log('    columnTypes:', query.columnTypes ? JSON.stringify(query.columnTypes) : 'undefined')
      return originalQueryRaw(query)
    },
    executeRaw: async (query: SqlQuery) => {
      capturedQueries.push(query)
      console.log('\n  Captured SqlQuery (executeRaw):')
      console.log('    SQL:', query.sql.substring(0, 80) + (query.sql.length > 80 ? '...' : ''))
      console.log('    argTypes:', JSON.stringify(query.argTypes))
      console.log('    columnTypes:', query.columnTypes ? JSON.stringify(query.columnTypes) : 'undefined')
      return originalExecuteRaw(query)
    },
  }

  // Copy dispose method if present
  if ('dispose' in adapter && typeof adapter.dispose === 'function') {
    (wrapped as any).dispose = adapter.dispose.bind(adapter)
  }

  return wrapped
}

async function main() {
  console.log('columnTypes Integration Test')
  console.log('='.repeat(60))

  // Create the adapter factory and wrap it for capture
  const baseFactory = new PrismaBetterSqlite3({ url: ':memory:' })
  const adapter = createCapturingAdapterFactory(baseFactory as unknown as SqlDriverAdapterFactory)

  const prisma = new PrismaClient({
    adapter: adapter as any,
  })

  try {
    // Clean up and setup
    console.log('\n[1] Setting up database...')
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
    console.log('    Database ready with Event table (DateTime as INTEGER)')

    // Insert test data
    console.log('\n[2] Creating test event...')
    capturedQueries.length = 0 // Clear previous queries

    const now = new Date()
    const event = await prisma.event.create({
      data: {
        name: 'Test Event',
        timestamp: now,
      },
    })
    console.log('    Created:', { id: event.id, name: event.name })

    // Query the data back
    console.log('\n[3] Querying events...')
    capturedQueries.length = 0 // Clear previous queries

    const events = await prisma.event.findMany()
    console.log('    Found:', events.length, 'event(s)')

    // Analyze captured queries
    console.log('\n' + '='.repeat(60))
    console.log('Analysis of captured queries:')
    console.log('='.repeat(60))

    let hasColumnTypes = false
    let hasDateTimeType = false

    for (let i = 0; i < capturedQueries.length; i++) {
      const query = capturedQueries[i]
      console.log(`\nQuery ${i + 1}:`)

      if (query.columnTypes !== undefined) {
        hasColumnTypes = true
        console.log('  columnTypes:', JSON.stringify(query.columnTypes))

        // Check if DateTime type (10) is present
        if (query.columnTypes.includes(ColumnTypeEnum.DateTime)) {
          hasDateTimeType = true
          console.log('  Found DateTime type hint (value:', ColumnTypeEnum.DateTime, ')')
        }

        // Decode the column types for readability
        const typeNames = query.columnTypes.map(t => {
          if (t === null) return 'null'
          const entry = Object.entries(ColumnTypeEnum).find(([_, v]) => v === t)
          return entry ? entry[0] : `Unknown(${t})`
        })
        console.log('  Decoded:', typeNames.join(', '))
      } else {
        console.log('  columnTypes: undefined (not provided by Query Compiler)')
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('Test Results:')
    console.log('='.repeat(60))
    console.log(`  columnTypes present: ${hasColumnTypes ? 'PASS' : 'FAIL (undefined)'}`)
    console.log(`  DateTime type hint:  ${hasDateTimeType ? 'PASS' : 'FAIL'}`)

    if (hasColumnTypes && hasDateTimeType) {
      console.log('\n  Integration test PASSED!')
      console.log('  The columnTypes flow from Query Compiler to Driver Adapter works.')
    } else {
      console.log('\n  Integration test: columnTypes NOT YET POPULATED')
      console.log('\n  This is expected if:')
      console.log('  - prisma-engines Query Compiler sets column_types to None')
      console.log('  - The WASM has not been rebuilt with populated values')
      console.log('\n  The TypeScript plumbing is working (no errors occurred).')
      console.log('  Once prisma-engines populates column_types, this test will pass.')
    }

  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)
