/** A product, as a picker and the unit narrowing read one. */
export interface InsecticideListing {
	readonly id: string;
	readonly tradeName: string;
	readonly isActive: boolean;
	/**
	 * What the product is measured in. The form narrows the unit list to that
	 * unit's *type* — a pound of granules is never four fluid ounces.
	 */
	readonly defaultUnitId: string;
}

/** A vehicle or a piece of equipment — the two rigs a treatment names. */
export interface RigListing {
	readonly id: string;
	readonly name: string;
	readonly isActive: boolean;
}

/** A mix, as the calculator reads one: a name, and what one batch of it is. */
export interface FormulationListing {
	readonly id: string;
	readonly formulationName: string;
	readonly isActive: boolean;
	readonly batchSize: number;
	readonly batchUnitId: string;
}

/** One product's share of a mix. */
export interface FormulationComponentListing {
	readonly id: string;
	readonly formulationId: string;
	readonly insecticideId: string;
	readonly amount: number;
	readonly unitId: string;
}
