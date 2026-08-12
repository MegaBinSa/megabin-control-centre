# Office Daily Roster workflow

1. Choose service date and region.
2. Generate the Draft roster from active permanent configuration. Repeating generation is safe and does not overwrite manual entries.
3. Review warnings, actual vehicle/depot, and day-specific staff composition.
4. Record planned staff or vehicle availability where needed, then regenerate missing Draft entries or edit assignments explicitly.
5. Any substitution or depot override requires a reason. A `409` requires refresh before retrying.
6. Run readiness validation and resolve every blocking issue before **Mark Ready**.
7. Lock the Ready roster when it must become stable input for future route planning.
8. Unlock only with `roster.unlock` and a reason. Active-day changes are emergency actions and create history/audit/events.

No route, stop, map, GPS, collection, or Driver PWA behavior is part of this workspace.
