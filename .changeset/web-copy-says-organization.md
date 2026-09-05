---
'@simmer-mosquito/web': minor
'@simmer-mosquito/admin': patch
---

Changed: the app no longer calls your Organization an agency. Not every customer
is one: abatement districts, city and county programs, health departments,
universities and contractors all run mosquito control, and the settings page has
said Organization since it shipped while the copy around it said agency.

Most of the strings did not need the noun and lost it. A catalog with nothing in
it now reads "An owner or admin can add habitat types for you", the Outreach
Methods page asks you to "Add the outreach methods you use", and the Collection
Methods page describes "The trap types you run". Where the noun is the subject it
says Organization: the sign-in screen, the general settings section, your
profile's Organization card, and the conflict message when somebody else saves
the same settings while you have them open.

Two other fixes came with it. The four sheets on the settings page all say
"Organization details are still loading." now, where two of them said agency.
And the Contacts pages no longer call a member of the public an organization,
which is the word for the body you work for: creating one reads "Add a person to
the contact list", and the list describes "The people you engage with on service
requests and notifications".

Changed: the staging banner lists Organizations, not Agencies, among what
staging refuses to change. The operations console shows the same banner.
