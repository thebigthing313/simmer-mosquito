/**
 * One service request as `/map/service-requests` lists it.
 *
 * The Map's rail and the Table both page through that endpoint, so the row is
 * written once here, and the request is `serviceRequestRecordSet`'s.
 */

/**
 * What a row shows, where on the map it sits, and the ids a surface resolves
 * for the page it draws. `closedAt` arrives as the JSON string the server
 * wrote, and only its presence is read.
 */
export interface ServiceRequestListing {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: number | null;
	readonly intakeType: string;
	readonly requestDate: string;
	readonly details: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly receivedByProfileId: string | null;
	readonly closedAt: string | null;
}
