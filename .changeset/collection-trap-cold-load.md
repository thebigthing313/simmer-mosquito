---
'@simmer-mosquito/web': patch
---

Fixed: Recording a collection from a trap's page, or from a trap stop on an assignment, saves on the first try in a freshly opened tab. It used to refuse with "Unable to determine the collection location." when the traps had not loaded before the form opened. The form now waits for the traps, then shows the trap's collection method under the picker and the trap's point on the map, when creating a collection and when editing one.
