---
'@simmer-mosquito/web': patch
---

Fixed: a compact card is the same height above its title as below its last row.
Forty-one cards drew 16px over the heading and 12px under the content, because
the header's padding was typed at the call site and the body's came from a
variant, and the two had drifted apart. Both halves now read one setting and
both draw 12px, so the panels on the record detail pages, the profile page and
the weather pages sit tighter and match top to bottom.
