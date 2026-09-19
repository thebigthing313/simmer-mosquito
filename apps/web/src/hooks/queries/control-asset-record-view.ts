/** A vehicle or a piece of equipment, as the list and the drawer read one. */
export interface ControlAssetRecord {
	readonly id: string;
	readonly name: string;
	/** Always `null` for a vehicle — the column is equipment's alone. */
	readonly serialNumber: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
}
