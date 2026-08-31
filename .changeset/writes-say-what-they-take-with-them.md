---
'@simmer-mosquito/web': minor
---

Added: The writes that quietly changed what other records say now ask first, with the number in the question. Marking a collection zero result says how many species counts it deletes, and changing an application's product says how many batch records it drops.

Added: Giving a trap a code another active trap already carries now asks before it saves. Codes may still be shared, deliberately, and the check compares them the way people read them, ignoring case and surrounding spaces.

Fixed: The two questions a stop can ask now come back with an answer attached. Recording a second inspection or collection against a stop that is already done says how many are already there, and a record filed against a different habitat or trap than the stop names says which. Both are still one tap to confirm.

Changed: The questions a weather station raises are worded the same way as every other confirmation now, and list the readings they turn on rather than repeating the server's own sentence.
