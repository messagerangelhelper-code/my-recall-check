# My Recall Check

Free vehicle safety recall checks using official NHTSA data (U.S. National Highway Traffic Safety Administration).

- Find a vehicle by VIN, or by year, make and model.
- See every safety recall: what's wrong, the risk, and the fix. "Do not drive" and "Park outside" warnings are shown first.
- Save vehicles to My Garage; they're re-checked automatically each time the app opens (at most hourly), and new recalls are flagged.
- Mark recalls as fixed for each vehicle. Saved on the phone only.
- Recall lookups go through the CashCow server (`/api/recalls/...`), which caches NHTSA's answers.

Free: all lookups and warnings, and 1 vehicle in My Garage. Premium (through CashCow): up to 10 vehicles.
One CashCow account works here and in the other CashCow apps. Rebrand in `brand.js`.

Note: NHTSA's recall list is for every vehicle of that year, make and model. To see whether a specific vehicle
still needs the repair, check its VIN at https://www.nhtsa.gov/recalls or call a dealer. Recall repairs are free.

## Render (Static Site)
- Build command: `npm install && npm run build`
- Publish directory: `dist`
