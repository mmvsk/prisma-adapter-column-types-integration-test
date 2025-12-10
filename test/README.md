# Integration Test

This directory contains the actual integration test for the `columnTypes` feature.

For full setup instructions, see the [root README](../README.md).

## Running Tests

After completing the setup from the root README:

```bash
# Generate Prisma Client
pnpm generate

# Run all tests
pnpm test:all

# Or run individually:
pnpm test:run   # Main integration test (requires built WASM)
pnpm test:mock  # TypeScript type verification only
```

## Test Files

- `src/test.ts` - Main integration test that captures `SqlQuery` objects and verifies `columnTypes` is populated
- `src/mock-test.ts` - TypeScript type verification test (doesn't require WASM)
- `prisma/schema.prisma` - Test schema with DateTime fields

## Schema

The test uses a simple `Event` model:

```prisma
model Event {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  timestamp DateTime
}
```

## Package Overrides

The `package.json` uses pnpm overrides to link to the local prisma submodule:

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
