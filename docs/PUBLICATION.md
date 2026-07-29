# ChatGPT publication checklist

This repository contains the technical plugin package. Public listing still requires developer-owned account, identity, domain and policy actions.

## Technical readiness

- [x] Dedicated public repository.
- [x] Plugin manifest at `.codex-plugin/plugin.json`.
- [x] Reusable Skill under `skills/`.
- [x] MCP server supporting stdio and Streamable HTTP.
- [x] Explicit read/write/destructive/open-world tool annotations.
- [x] No arbitrary shell or SSH tool.
- [x] HTTPS-ready container image.
- [ ] OAuth 2.1 authorization server integration.
- [ ] Tenant-scoped encrypted token storage.
- [ ] Rate limits and abuse protection.
- [ ] Durable audit database.
- [ ] Public production deployment and monitoring.
- [ ] Registered remote MCP connection metadata after the MCP service is registered.

## Listing assets

- [ ] Final public plugin name.
- [ ] Square icon and logo assets.
- [ ] Screenshots showing project status, deployment, diagnostics and rollback confirmation.
- [ ] Public website.
- [ ] Support URL/contact.
- [ ] Privacy policy.
- [ ] Terms of service.
- [ ] Data retention and deletion description.

## Review materials

- [ ] Explain the GitHub Runner architecture and why SSH keys are not collected.
- [ ] Provide a demo/test GitHub account or review repository.
- [ ] Provide at least five successful user scenarios.
- [ ] Provide at least three negative/error scenarios.
- [ ] Document every OAuth scope and why it is necessary.
- [ ] Document all external domains in the content security policy.
- [ ] Verify the MCP domain and developer identity.

## Suggested positive review scenarios

1. List the registered demo projects.
2. Read a healthy project status snapshot.
3. Read recent CI and deployment runs.
4. Trigger a demo diagnostics workflow and observe the accepted result.
5. Trigger a demo deployment for a tested `main` branch and verify the deployed SHA afterward.

## Suggested negative review scenarios

1. Request an unknown project ID; the tool returns a bounded error and performs no action.
2. Request rollback without literal `ROLLBACK`; schema validation rejects the call.
3. Attempt to specify an arbitrary workflow or shell command; no such tool or parameter exists.
4. Use an expired or revoked OAuth token; the server rejects access.
5. Request status from a repository outside the user's authorization; the server denies access.

## Publication sequence

1. Complete private end-to-end testing against SuMeMe.
2. Deploy the OAuth-enabled MCP service under a verified public domain.
3. Create production policies and support pages.
4. Register and test the remote MCP connection in ChatGPT.
5. Produce screenshots and reviewer test credentials.
6. Submit through the OpenAI plugin/app submission process.
7. Address review feedback without weakening the security model.

## Actions requiring the developer account owner

- accepting platform terms;
- identity or business verification;
- proving control of the public domain;
- authorizing OAuth applications;
- submitting legal representations;
- pressing the final public submission control when required.
