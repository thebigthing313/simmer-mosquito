/** What every catalog page shows and every catalog dialog edits. */
export interface NamedCatalogRecord {
	readonly id: string;
	readonly name: string;
	readonly isActive: boolean;
}

export interface DescribedCatalogRecord extends NamedCatalogRecord {
	readonly description: string | null;
}

export interface SchemaCatalogRecord extends DescribedCatalogRecord {
	readonly customSchema: unknown;
}

/** Collection methods alone carry a count that warrants a response. */
export interface CollectionMethodRecord extends SchemaCatalogRecord {
	readonly actionThreshold: number | null;
}

/** A control method is a name and whatever extra fields the organization attached. */
export interface ControlMethodRecord extends NamedCatalogRecord {
	readonly customSchema: unknown;
}

/** The two halves of a catalog, each in name order. */
export interface CatalogRecords<TRecord> {
	readonly activeRecords: readonly TRecord[];
	readonly inactiveRecords: readonly TRecord[];
}
