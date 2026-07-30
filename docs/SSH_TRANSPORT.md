# GHS — GitHub-hosted SSH deployment

`GHS` is the canonical ADOB code for **GitHub-hosted SSH**.

```text
GHS
GitHub-hosted Runner
      ↓ exact tested revision
Pinned SSH + rsync
      ↓
VPS allow-listed project deployment script
```

The alternative mode is `VSR` — VPS Self-hosted Runner. See `DEPLOYMENT_MODES.md` for the full comparison.

## Reusable workflow

GHS is implemented by:

```text
b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml
```

The workflow checks out the caller repository at the exact tested SHA, uploads the source tree to a staging directory outside production, and runs the caller repository's allow-listed deployment script with:

```text
ADOB_MODE=GHS
DEPLOY_DIR=<production path>
SOURCE_DIR=<uploaded source path>
```

The project deployment script remains responsible for Docker Compose operations, local health checks, snapshots and rollback.

## Required mode declaration

Callers should explicitly pass:

```yaml
with:
  adob_mode: GHS
```

The reusable workflow accepts only `GHS`. A different value is rejected before checkout or SSH setup.

## Security rules

- The SSH private key belongs in the managed project's GitHub Actions secrets, never in ADOB source, ChatGPT, Codex, issues, logs or the MCP server.
- Use a dedicated non-root deployment account. Docker group membership is production-level privilege and must be treated accordingly.
- Pin the VPS host key using an exact `known_hosts` line copied from the VPS.
- The workflow uses `StrictHostKeyChecking=yes`; it never falls back to `ssh-keyscan` or disables verification.
- The caller supplies a repository-relative deployment script. ADOB does not accept an arbitrary remote command.
- `.env`, databases, object storage, volumes and backups stay on the VPS and are excluded from rsync.
- Pin callers to an ADOB commit SHA or reviewed release tag instead of an unpinned branch.

## VPS bootstrap

Generate a dedicated key pair in a secure administrative session:

```bash
install -d -m 700 /root/adob-deploy-key
ssh-keygen \
  -t ed25519 \
  -C "github-actions:<owner>/<repository>" \
  -f /root/adob-deploy-key/id_ed25519 \
  -N ""
```

Run the ADOB installer from a trusted checkout:

```bash
SSH_PUBLIC_KEY="$(cat /root/adob-deploy-key/id_ed25519.pub)" \
DEPLOY_USER="existing-or-new-deploy-user" \
DEPLOY_DIR="/opt/project" \
SSH_HOST="VPS_PUBLIC_IP_OR_SSH_HOST" \
SSH_PORT="22" \
bash installer/install-ssh-deploy.sh
```

For an existing VSR deployment, reusing its dedicated service account during migration avoids changing ownership of the production directory. Do not stop the VSR Runner until the first GHS deployment and status verification both succeed.

The installer prints the exact host-key line to save as a GitHub secret. Save the complete private key as a separate GitHub secret, then remove the administrative copy after the first successful deployment.

## Caller workflow

A managed repository calls ADOB as a reusable job after its CI jobs succeed:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/test.sh

  deploy-production-ghs:
    if: >-
      github.event_name == 'push' &&
      github.ref == 'refs/heads/main' &&
      vars.ADOB_MODE == 'GHS'
    needs: [test]
    uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
    with:
      adob_mode: GHS
      project_name: example
      ssh_host: ${{ vars.VPS_HOST }}
      ssh_port: ${{ vars.VPS_PORT || '22' }}
      ssh_user: ${{ vars.VPS_USER }}
      deploy_path: /opt/example
      deploy_script: scripts/deploy-production.sh
      public_health_url: https://example.com/health
    secrets:
      ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
      ssh_host_key: ${{ secrets.SSH_HOST_KEY }}
```

Keep a VSR job behind the opposite condition during migration:

```yaml
if: vars.ADOB_MODE != 'GHS'
env:
  ADOB_MODE: VSR
```

After GHS deployment is verified, set:

```text
ADOB_MODE=GHS
```

The old VSR Runner can then be stopped and later unregistered. Keeping the fallback workflow in source may be useful for recovery, but it must remain disabled and must not silently execute after a GHS failure.

## Required managed-project contract

The caller deployment script must:

1. accept the exact Git SHA as its first argument;
2. read the uploaded checkout from `SOURCE_DIR`;
3. deploy into `DEPLOY_DIR` without replacing persistent `.env` or data volumes;
4. serialize production changes with a lock;
5. verify local service health;
6. write `${DEPLOY_DIR}/.deploy/current_sha` on success;
7. record bounded, sanitized deployment history;
8. attempt a safe code rollback when possible.

ADOB's GHS workflow additionally checks the optional public health URL after the project script succeeds.
