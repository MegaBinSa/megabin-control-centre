# Office Master-Data Administration

**Status:** Phase 1B implemented workflow

Office Web restores a Supabase Auth session before loading application-controlled profile, role, permission, and region-scope data. Users without `master_data.read` cannot enter the administration area. Client identity and contact screens additionally require `clients.sensitive.read`; hiding controls is a user-experience measure and the API repeats every check.

The resource screens cover Clients, Client Contacts, Service Addresses, Client Services, Service Configurations, Service Regions, Depots, Territories (non-geometry fields), Teams, Staff, and Vehicles. Lists support bounded pagination and text search. Writes carry an idempotency key and correlation ID, validate at the backend, run through a fixed resource command boundary, and record a business audit fact. Archive is a soft lifecycle/deactivation action.

Edits submit the `updatedAt` value loaded with the record. A changed timestamp returns the stable `conflict` error and requires refresh rather than silently overwriting another user's work. Service configuration remains effective-dated; destructive historical editing is not an approved workflow.

The Office app uses only the versioned application API for writes. It contains no service-role credential and does not use user-editable Auth metadata for authorization.
