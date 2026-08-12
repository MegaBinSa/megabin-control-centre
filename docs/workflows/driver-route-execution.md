# Driver route execution workflow

1. Sign in on the Driver PWA and download the currently assigned route manifest.
2. Review team, vehicle, date, stop order, access instructions, and safety flags.
3. Accept and start the route. Either action may be queued offline.
4. Open the previous, current, or next stop and record an outcome. `cleaned` records actual drums; exception outcomes that require context record a reason.
5. Review visible stop and drum progress. Report `near_capacity` when required.
6. When online, queued actions synchronize in their original client order. Duplicate receipts are safe; rejected and conflicting actions remain visible.
7. Complete the route only after every stop has a terminal result and no blocking local action remains.
8. Logout clears cached operational data from the device.

Office users can observe derived progress and open-issue counts but cannot overwrite Driver stop results directly.
