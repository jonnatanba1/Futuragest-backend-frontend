# Inventory backup and restore runbook

## Required service objectives

- PostgreSQL RPO: 5 minutes or less through encrypted base backups plus continuous WAL archiving.
- RTO: 4 hours or less.
- Restore drill: monthly during pilot, quarterly afterward, and before go-live.

## Restore drill

1. Restore the latest base backup into an isolated network.
2. Replay WAL to the selected recovery point.
3. Start a disposable API against the restored database.
4. Verify users/roles, inventory commands, movements, balances, shipments, counts, and related object metadata.
5. Run ledger reconciliation and require zero mismatches.
6. Record recovered timestamp, actual RPO/RTO, command counts, and discrepancies.
7. Destroy the isolated environment securely after evidence is approved.

## Mobile replay after disaster recovery

Acknowledged mobile events retain their original encrypted payload. If the restored server lost a recent ACK, re-send the same `clientEventId`; the server must recreate at most one effect. A different payload with the same ID is a security incident.

Never perform a production restore without a current backup, an approved recovery point, and a rollback owner.

