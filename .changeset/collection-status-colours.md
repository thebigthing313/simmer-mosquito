---
'@simmer-mosquito/web': patch
---

Changed: The collections map paints each collection by status, the way the samples map does: amber while the trap is still out, teal once it is in, slate for a zero result, red for a reported problem. The map has a key, and the result rail carries the same colour as a dot. Rows keep their Bycatch badge and drop the three that repeated the dot.

Fixed: The collections rail never showed a Trap out badge, because the row it read did not carry the timing mode the badge is decided by. The status is resolved server-side now, so a trap that is still out reads as one.
