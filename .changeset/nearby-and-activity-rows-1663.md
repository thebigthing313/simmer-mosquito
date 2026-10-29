---
'@simmer-mosquito/web': patch
---

Fixed: On a service request, the line above each nearby tab's list counts only that tab's records. It used to count all four tabs together, so Service Requests could say 27 records above an empty list. In those lists and in a person's activity, a record with nothing else to name it is titled by its coordinates instead of "Inspection", a collection taken away from a trap reads its address before its coordinates, and an inspection at a habitat that has not loaded yet reads "Habitat" and the start of its id.
