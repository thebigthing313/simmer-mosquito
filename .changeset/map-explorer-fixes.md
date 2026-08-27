---
'@simmer-mosquito/web': patch
---

Fixed: A result list that fails to load says so and offers to try again, instead of reporting that nothing matched the filters.

Fixed: The result rail on every map page was drawing its rows wider than the panel holding them, so the status badge and the "view details" chevron were cut off the right edge and long names ran on instead of truncating. On Inspections the row's name column was squeezed to nothing and rows drew with no record name at all.

Fixed: A map panel with a long title pushed its collapse control off the right edge, so Requests for Control, Service Requests, Weather Stations and the Address Book could not be collapsed. A panel with no pager under it now states its result count in the header instead of nowhere, the filter column no longer scrolls sideways, a rail holding one record says "1 request" rather than "1 requests", and an address row no longer repeats its street line under itself.

Fixed: Service Requests and Requests for Control counted their default Open status as an active filter, so an untouched page reported one filter set and offered a Clear all with nothing under it.

Fixed: The collections rail never showed a Trap out badge, because the row it read did not carry the timing mode the badge is decided by. The status is resolved server-side now, so a trap that is still out reads as one.

Fixed: The map's place search works from the keyboard. Arrow keys move through the suggestions, Enter takes one, and Escape closes the list.

Fixed: The blue dot in the Inspections key reads "Wet only" rather than "None". Beside it sat "Dry", and nothing told a reader that the first one is water with no larvae in it.
