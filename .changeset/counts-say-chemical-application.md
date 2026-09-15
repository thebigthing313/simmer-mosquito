---
'@simmer-mosquito/web': patch
---

Fixed: three counts on the chemical screens say what the record is called
everywhere else. Saving several products off one formulation confirms
"Recorded 3 chemical applications." rather than "Recorded 3 applications.",
the message when some of them saved and one failed reads "Recorded 2 of 5
chemical applications before failing", and the mix preview over the form reads
"Saves as 3 chemical applications". The page's own heading, its back link and
its sidebar entry have said "Chemical Applications" since the noun register
shipped, so the line confirming the save was the one place left naming the
record by a shorter word.
