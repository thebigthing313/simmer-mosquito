import { useQuery } from '@tanstack/react-query';
import {
	fetchLinkedRecords,
	type LinkedRecordsRead,
} from '../../components/gis/addresses/address-linked-records';

/**
 * The records whose Linked Address is this Address, one page per family, as
 * the read the Address page's Linked Records card takes. Takes the Address id.
 */
export function useAddressLinkedRecords(addressId: string): LinkedRecordsRead {
	return useQuery({
		queryKey: ['address-linked-records', addressId],
		queryFn: ({ signal }) => fetchLinkedRecords(addressId, signal),
		staleTime: 30_000,
	});
}
