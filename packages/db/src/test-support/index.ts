// The seeded unit catalog, so packages above this one can check themselves
// against the units that actually exist. `packages/db` sits below
// `packages/domain` and cannot import it, so the comparison has to happen up there.
export { syncBaselineUnits } from '../seeds/sync-baseline.js';
export { createCompileOnlyDb } from './compile-only-db.js';
export { describeDbIntegration, type TestDbContext, withTestDb } from './db-integration.js';
// The migration set as text, for the coverage tests that hold a hand-kept list to
// the schema. `packages/db` cannot host them: they read the generated row schemas
// in `packages/sync`, which sits above it.
export { readUpMigrations, type UpMigration } from './migration-sql.js';
