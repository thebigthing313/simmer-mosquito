---
'@simmer-mosquito/admin': minor
'@simmer-mosquito/web': patch
---

Changed: the operator console no longer calls a customer an agency. Not every
customer is one, and the console has always routed the directory at
`/organizations` while the button above it read Create Agency.

The section is Organizations now, from the sidebar label and the breadcrumb down
to the directory heading, the create form, and the Organization id on a
customer's detail page. The unlinked warning reads "1 organization is not linked
to WorkOS, so nobody there can sign in", which also stops the same sentence using
organization for two different things.

Where the noun was doing no work it is gone. The global taxonomy and units pages
say "Changes apply to everyone using this genus" and "will be removed for
everyone", the foundations page offers "The first traps" and "Load the district
boundaries from the KML, KMZ, or GeoJSON they sent", and the members list asks
you to "Invite the first owner or admin below".

Changed: deleting a species from the global taxonomy names what still cites it as
an organization species list, not an agency species list. That count is what the
refusal is counted from, so it is the sentence you read before confirming.
