---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Changed: Phone numbers read as (555) 123-4567 wherever they are shown, however they were typed. That covers Contacts, the parties on a Service Request, the contact picker, Registrations, the cleanup tool and the Organization's own number. Extensions read as "ext. 12", and a number that is not a US one shows as it was entered. Searching Contacts by a number finds it whichever way it was stored.
