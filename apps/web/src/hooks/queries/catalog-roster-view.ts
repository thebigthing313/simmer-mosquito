/** A catalog row as a picker reads one. */
export interface CatalogListing {
	readonly id: string;
	readonly name: string;
	readonly isActive: boolean;
}

/** The same, plus whatever extra fields the organization attached to this row. */
export interface SchemaCatalogListing extends CatalogListing {
	readonly customSchema: unknown;
}
