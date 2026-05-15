import { createDb } from './index.js';
import { SYNC_BASELINE_ORGANIZATION_ID, seedSyncBaseline } from './seeds/sync-baseline.js';

const databaseUrl = process.env.DATABASE_URL ?? process.env.SIMMER_DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
	console.error('DATABASE_URL or SIMMER_DATABASE_URL is required to seed sync baseline data.');
	process.exit(1);
}

const db = createDb({
	databaseUrl,
	maxConnections: 1,
});

try {
	const result = await seedSyncBaseline(db, {
		organizationId:
			process.env.SIMMER_SYNC_BASELINE_ORGANIZATION_ID ?? SYNC_BASELINE_ORGANIZATION_ID,
	});

	console.log(
		[
			`Seeded sync baseline organization ${result.organizationId}.`,
			`profiles=${result.profileCount}`,
			`units=${result.unitCount}`,
			`genera=${result.genusCount}`,
			`species=${result.speciesCount}`,
			`organization_species=${result.organizationSpeciesCount}`,
			`collection_methods=${result.collectionMethodCount}`,
			`collection_lures=${result.collectionLureCount}`,
			`habitat_types=${result.habitatTypeCount}`,
			`tags=${result.tagCount}`,
			`routes=${result.routeCount}`,
		].join(' '),
	);
} finally {
	await db.destroy();
}
