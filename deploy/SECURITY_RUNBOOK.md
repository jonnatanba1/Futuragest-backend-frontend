# Production security and recovery runbook

This runbook is a deployment gate. Never copy production credentials into Git,
issue comments, shell history, or chat transcripts.

## Incident containment

1. Rotate PostgreSQL, MinIO, JWT, administrative-user, and signing credentials.
2. Revoke active application sessions after rotating JWT/session material.
3. Restrict PostgreSQL and the MinIO console/API to the intended private network;
   only the TLS reverse proxy may expose required HTTP services.
4. Review PostgreSQL, MinIO, proxy, SSH, and application access logs from the
   first known public exposure through containment.
5. Remove leaked material from the working tree, then rewrite Git history with
   `git filter-repo` from a clean mirror. Coordinate the force-push and require
   every collaborator to reclone. Rotation is still mandatory because forks and
   caches cannot be recalled.
6. Run `node scripts/scan-secrets.mjs` before every deployment.

## Backup/PITR gate

Production is not approved until the operator configures and proves:

- encrypted PostgreSQL base backups in a separate account/provider;
- continuous WAL archiving with a maximum five-minute archive timeout;
- encrypted MinIO replication or backup;
- retention and immutability policies;
- alerting on failed/stale backups;
- a restore into an isolated environment, followed by ledger/balance
  reconciliation;
- recorded RPO/RTO evidence and named on-call owners.

The Docker volumes in `docker-compose.yml` are persistence, **not backup**.

## Release verification

- API, web, and public MinIO presigned URLs use HTTPS.
- Traefik's insecure dashboard and port 8080 are disabled.
- PostgreSQL has no host-published port.
- MinIO console is private; S3 API is exposed only through TLS when required.
- Android release uses the production signing key and rejects cleartext.
- Secret scan, dependency checks, migrations, tests, and a recent restore drill
  are green.
