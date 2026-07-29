# Security model

## Threat model

AutoDevOps Bridge assumes repository content, issues, pull requests, workflow logs, service logs, and status snapshots may contain malicious or misleading text. They are data, not trusted instructions.

Primary risks include prompt injection, excessive GitHub permissions, unauthorized workflow dispatch, secret leakage, unrestricted production shell access, cross-tenant access, and unsafe rollback around database migrations.

## Controls

### No unrestricted shell

The MCP server has no `run_shell`, `ssh`, `exec`, or arbitrary workflow-name tool. It can call only workflow filenames stored in the server-side project registry.

### Least-privilege GitHub access

For private MVP testing, use a fine-grained GitHub token restricted to selected repositories. For public release, replace the shared token with per-user OAuth and encrypted tenant-scoped storage.

### Sanitized status boundary

The snapshot must not include `.env`, API keys, private keys, cookies, database connection strings, complete user documents, personal memory contents, or unrestricted raw logs.

### Write-action controls

- Deployment triggers only an allow-listed workflow.
- Diagnostics use bounded inputs and a service allow-list enforced by the target workflow.
- Rollback requires literal `ROLLBACK` confirmation and is marked destructive.
- Production workflows should use concurrency locks and trusted branches or SHAs.

### Transport security

- Public mode must be behind HTTPS.
- The private HTTP MVP supports a bearer secret and Host allow-list.
- Public mode must implement OAuth 2.1, PKCE, audience/resource validation, expiry and revocation.

### Auditability

All production actions run as GitHub Actions workflows, preserving actor, commit, inputs, timestamps, logs and results.

## Operational recommendations

- Keep managed repositories private when a persistent runner has production access.
- Use a dedicated non-root runner account.
- Avoid untrusted fork PRs on the production runner.
- Protect production workflows and the project registry.
- Pin third-party actions to reviewed commit SHAs before public release.
- Set log, backup and Docker image retention policies.
- Alert on disk pressure, repeated restarts, failed deployments and stale snapshots.

## Incident response

1. Disable or remove the affected project from the registry.
2. Revoke the GitHub token or OAuth grant.
3. Stop the MCP service if unauthorized calls are suspected.
4. Inspect GitHub workflow history.
5. Rotate potentially exposed credentials.
6. Restore a trusted release through the reviewed rollback process.
7. Add a regression test before restoring access.
