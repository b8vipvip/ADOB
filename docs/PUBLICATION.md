# ADOB production-readiness checklist

[English](PUBLICATION.md) | [简体中文](zh-CN/PUBLICATION.md) | [日本語](ja-JP/PUBLICATION.md)

ADOB is an automated development-agent system. This checklist covers reliable private or multi-user production operation.

## Controller readiness

- [x] Bounded MCP tools with read/write/destructive annotations.
- [x] Project allow-list and explicit VSR/GHS modes.
- [x] No arbitrary shell or SSH tool.
- [x] Streamable HTTP and stdio transports.
- [x] Authenticated private HTTP mode.
- [x] Workflow polling with non-terminal queued/running states.
- [x] Maximum five-minute bounded wait and later recheck support.
- [ ] OAuth 2.1 and PKCE for a public multi-user service.
- [ ] Tenant-scoped encrypted credential storage.
- [ ] Rate limits, abuse protection and revocation.
- [ ] Durable audit and retention policy.

## GitHub readiness

- [x] Fine-grained token permission guidance.
- [x] Managed-repository onboarding wizard.
- [x] CI, deploy, diagnose, rollback and status templates.
- [x] Pinned reusable-workflow revision.
- [x] Pinned SSH host identity for GHS.
- [ ] Required branch/ruleset protections enabled on every managed repository.
- [ ] Token expiration and rotation calendar.
- [ ] Runner update and isolation process for VSR.

## VPS readiness

- [x] Non-root deployment account for GHS.
- [x] Production data excluded from source synchronization.
- [x] Bounded diagnostics and explicit rollback confirmation.
- [ ] Tested backup and restore procedure.
- [ ] Monitoring for disk, memory, health and certificate expiry.
- [ ] Documented incident response and emergency access.
- [ ] Recovery test after server replacement.

## Workflow behavior tests

- [ ] A queued workflow is reported as pending, not failed.
- [ ] An in-progress workflow remains non-terminal.
- [ ] `wait_seconds=0` returns tracking data for parallel work.
- [ ] A 300-second wait returns success if the run completes.
- [ ] A 300-second timeout returns still-pending state.
- [ ] A completed failure is reported only after GitHub supplies the terminal conclusion.
- [ ] Duplicate deployment is not triggered while the first run is active.
- [ ] Production verification occurs after the deployment run completes.

## Release sequence

1. Run type checks, unit tests and container build.
2. Test one GHS and one VSR project where available.
3. Verify pending, success, failure and timeout workflow states.
4. Verify sanitized `ops-status` output.
5. Review secrets, token scope and host-key pinning.
6. Tag the release and pin managed repositories to the reviewed revision.
7. Monitor the first production runs and confirm deployed SHA.

## Human-owned actions

ADOB should not automate account ownership proofs, CAPTCHA, payment, domain registrar access, legal acceptance, or the first privileged server bootstrap without an authorized operator.
