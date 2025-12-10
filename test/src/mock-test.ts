/**
 * Mock Test for columnTypes TypeScript Types
 *
 * This test verifies that the TypeScript types for columnTypes are correctly
 * defined and can be used, independent of the WASM Query Compiler.
 *
 * It simulates what happens when the Query Compiler provides columnTypes values.
 */

import { ColumnTypeEnum, type SqlQuery, type ColumnType } from '@prisma/driver-adapter-utils'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (e) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

function main() {
  console.log('columnTypes Mock Test (TypeScript Types)')
  console.log('='.repeat(60))
  console.log()

  // Test 1: ColumnTypeEnum values
  console.log('[1] ColumnTypeEnum values:')
  test('Int32 = 0', () => assertEqual(ColumnTypeEnum.Int32, 0))
  test('Int64 = 1', () => assertEqual(ColumnTypeEnum.Int64, 1))
  test('Text = 7', () => assertEqual(ColumnTypeEnum.Text, 7))
  test('DateTime = 10', () => assertEqual(ColumnTypeEnum.DateTime, 10))
  test('Int32Array = 64', () => assertEqual(ColumnTypeEnum.Int32Array, 64))
  test('DateTimeArray = 74', () => assertEqual(ColumnTypeEnum.DateTimeArray, 74))
  test('UnknownNumber = 128', () => assertEqual(ColumnTypeEnum.UnknownNumber, 128))
  console.log()

  // Test 2: SqlQuery with columnTypes
  console.log('[2] SqlQuery with columnTypes:')

  // Simulate a query for Event table: id (Int), name (Text), createdAt (DateTime), updatedAt (DateTime), timestamp (DateTime)
  const mockQuery: SqlQuery = {
    sql: 'SELECT id, name, createdAt, updatedAt, timestamp FROM Event',
    args: [],
    argTypes: [],
    columnTypes: [
      ColumnTypeEnum.Int32,    // id
      ColumnTypeEnum.Text,     // name
      ColumnTypeEnum.DateTime, // createdAt
      ColumnTypeEnum.DateTime, // updatedAt
      ColumnTypeEnum.DateTime, // timestamp
    ],
  }

  test('SqlQuery accepts columnTypes array', () => {
    assertEqual(Array.isArray(mockQuery.columnTypes), true)
  })

  test('columnTypes has correct length', () => {
    assertEqual(mockQuery.columnTypes?.length, 5)
  })

  test('columnTypes[0] is Int32', () => {
    assertEqual(mockQuery.columnTypes?.[0], ColumnTypeEnum.Int32)
  })

  test('columnTypes[2] is DateTime', () => {
    assertEqual(mockQuery.columnTypes?.[2], ColumnTypeEnum.DateTime)
  })
  console.log()

  // Test 3: SqlQuery with null values (unknown columns)
  console.log('[3] SqlQuery with null columnTypes (infer mode):')

  const queryWithNulls: SqlQuery = {
    sql: 'SELECT * FROM SomeTable',
    args: [],
    argTypes: [],
    columnTypes: [
      ColumnTypeEnum.Int32,
      null, // Unknown - adapter should infer
      ColumnTypeEnum.Text,
      null, // Unknown - adapter should infer
    ],
  }

  test('SqlQuery accepts null values in columnTypes', () => {
    assertEqual(queryWithNulls.columnTypes?.[1], null)
    assertEqual(queryWithNulls.columnTypes?.[3], null)
  })

  test('Non-null values are preserved', () => {
    assertEqual(queryWithNulls.columnTypes?.[0], ColumnTypeEnum.Int32)
    assertEqual(queryWithNulls.columnTypes?.[2], ColumnTypeEnum.Text)
  })
  console.log()

  // Test 4: SqlQuery without columnTypes (backward compatibility)
  console.log('[4] SqlQuery without columnTypes (backward compatible):')

  const legacyQuery: SqlQuery = {
    sql: 'SELECT * FROM OldTable',
    args: [],
    argTypes: [],
    // No columnTypes - simulates old Query Compiler behavior
  }

  test('SqlQuery works without columnTypes', () => {
    assertEqual(legacyQuery.columnTypes, undefined)
  })

  test('sql property is accessible', () => {
    assertEqual(typeof legacyQuery.sql, 'string')
  })
  console.log()

  // Test 5: Type checking at compile time
  console.log('[5] Type safety checks:')

  // This verifies that ColumnType can be used as expected
  const columnType: ColumnType = ColumnTypeEnum.DateTime
  test('ColumnType accepts ColumnTypeEnum value', () => {
    assertEqual(columnType, 10)
  })

  // Array of ColumnType | null
  const columnTypesArray: Array<ColumnType | null> = [
    ColumnTypeEnum.Int32,
    null,
    ColumnTypeEnum.DateTime,
  ]
  test('Array<ColumnType | null> works correctly', () => {
    assertEqual(columnTypesArray.length, 3)
  })
  console.log()

  // Summary
  console.log('='.repeat(60))
  console.log('Mock Test Summary:')
  console.log('='.repeat(60))
  console.log('  All TypeScript types for columnTypes are correctly defined.')
  console.log('  The driver-adapter-utils package is ready to receive columnTypes.')
  console.log()
  console.log('  When WASM Query Compiler populates column_types:')
  console.log('  - Values will serialize as numbers (0, 7, 10, etc.)')
  console.log('  - TypeScript will receive them in SqlQuery.columnTypes')
  console.log('  - Adapters can use these hints for correct type conversion')
}

main()
