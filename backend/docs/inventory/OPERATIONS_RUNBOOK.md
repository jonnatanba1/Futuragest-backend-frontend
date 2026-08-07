# Inventory operations runbook

## Safe rollout

1. Apply all Prisma migrations before deploying the API.
2. Create products, versioned units, locations, and effective assignments.
3. Import opening balances once and verify `GET /inventario/reconciliation` has no mismatches.
4. Enable `inventoryEnabled` only for pilot locations after their physical cutover is signed.
5. Keep the spreadsheet read-only for seven days as a comparison artifact, never as a second writer.

## Daily checks

- `GET /inventario/metrics`: review command status counts, oldest review age, active shipment age, and submitted counts.
- `GET /inventario/reconciliation`: any mismatch is a stop-the-line incident.
- Review `NEEDS_REVIEW` commands without editing or deleting their original payload.
- Investigate shipments that remain in transit beyond the operational SLA.

## Conflict handling

1. Identify the original command and its assignment window.
2. Verify physical stock and the latest closed count.
3. Approve only into an authorized location or dismiss with a precise reason.
4. Correct mistakes with a referenced reversal or count adjustment; never update ledger rows.

## Rollback

Disable `inventoryEnabled` for affected locations. This stops new mobile context/sync effects while preserving encrypted outboxes, commands, ledger, balances, shipments, and counts. Do not delete movements or mobile databases.

