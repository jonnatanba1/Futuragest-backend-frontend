# Mobile inventory data runbook

## Key or database failure

- Never delete, recreate, or replace an inventory database that fails to open.
- Keep the per-user encrypted file and its Android Keystore entry together.
- Capture device/user identifiers and the error category without logging payload, quantity, GPS, token, or key material.
- Escalate for forensic recovery; reinstalling the app can permanently destroy unsynchronized data.

## Logout, expired auth, and user changes

- Logout clears bearer credentials only. It must not clear the session owner, encryption key, cached context, or outbox.
- An authoritative 401/403 moves pending rows to `BLOCKED_AUTH`; a valid login resumes them.
- A different user cannot open or sync the previous owner's database while unresolved rows exist.

## Lost or compromised device

1. Revoke device sessions and access tokens server-side.
2. Preserve already received commands and audit data.
3. Treat records not committed to the server as unrecoverable if the device cannot be recovered; encryption prevents remote reconstruction.
4. Perform a physical count and reconcile through the normal count workflow.

