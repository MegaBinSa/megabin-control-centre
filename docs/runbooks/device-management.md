# Driver Device Management Runbook

For a new device, provision the synthetic/approved Driver user, link Staff and Team, register the tracking device, assign it to the vehicle where applicable, install the Driver PWA over HTTPS, sign in, verify manifest scope and test offline/online synchronization. Never share Driver credentials.

Replacement suspends/revokes the old tracking device before assigning the new device. Suspension is reversible only after ownership and custody are verified. Lost/stolen devices require immediate Auth session revocation, application-user disable where necessary, tracking-device revocation, assignment removal, incident recording and assessment of cached manifest/location exposure. Reassignment records reason and verifies the old device no longer receives a manifest.

PWA release upgrades replace only versioned shell caches. IndexedDB route/action/location queues are not deleted by service-worker activation; logout deliberately clears operational stores. Validate cached-route plus queued-action upgrade behavior on real staging devices before pilot.
