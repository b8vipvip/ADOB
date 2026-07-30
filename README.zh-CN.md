# AutoDevOps Bridge（ADOB）

[English](README.md) | **简体中文** | [日本語](README.ja-JP.md)

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

AutoDevOps Bridge 是一个可复用的 ChatGPT/Codex 插件，用于通过可审计、白名单化的 GitHub 工作流运维自托管软件项目。

## 标准部署模式

ADOB 只有一套开发生命周期，但提供两种生产执行模式。配置项目或要求 ChatGPT 部署时，请始终使用准确的大写模式代码。

| 代码 | 完整名称 | 执行路径 | 主要要求 |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner（VPS 自托管 Runner） | GitHub Actions → VPS 上常驻的 Runner → 项目脚本 | VPS 上持续安装并在线运行一个可信的自托管 Runner |
| `GHS` | GitHub-hosted SSH（GitHub 托管 SSH） | GitHub 托管 Runner → 固定主机密钥的 SSH/rsync → VPS 项目脚本 | 在 GitHub Actions secrets 中保存专用 SSH 密钥和准确的 VPS 主机密钥 |

```text
ChatGPT / Codex
       │
       ▼
AutoDevOps MCP 服务器
       │ GitHub API
       ▼
受管仓库工作流
       │
       ├─ VSR：VPS 自托管 Runner
       │
       └─ GHS：GitHub 托管 Runner → 固定主机密钥的 SSH/rsync → VPS
```

`VSR` 和 `GHS` 描述生产执行方式，与 MCP 连接传输方式 `stdio` 和 `http` 相互独立。

完整对比与声明规则请参阅 [`docs/zh-CN/DEPLOYMENT_MODES.md`](docs/zh-CN/DEPLOYMENT_MODES.md)。

## 如何声明模式

项目注册表：

```json
{
  "id": "sumeme",
  "repo": "b8vipvip/sumeme",
  "deploymentMode": "GHS"
}
```

自然语言请求：

```text
使用 GHS 模式部署 sumeme 项目。
```

MCP 工具调用：

```json
{
  "tool": "trigger_deploy",
  "arguments": {
    "project_id": "sumeme",
    "mode": "GHS",
    "ref": "main"
  }
}
```

`mode` 参数可选，默认使用服务器端项目注册表中的配置。显式传入时，它必须与已配置的项目模式一致；如果不一致，ADOB 会拒绝请求，而不是静默改用另一条执行路径。

只读工具 `list_deployment_modes` 会返回标准模式定义，项目和状态工具的输出中也会包含已配置的模式。

## 当前版本支持的功能

- 将一个或多个 GitHub 仓库注册为项目。
- 为每个项目声明 `VSR` 或 `GHS` 生产模式。
- 从 `ops-status` 分支读取经过脱敏的生产状态快照。
- 查看最近的 GitHub Actions 运行记录。
- 触发白名单中的部署工作流。
- 触发白名单中的诊断工作流。
- 仅在显式提供 `ROLLBACK` 确认值时触发回滚。
- 使用 VPS 自托管 Runner，或 ADOB 提供的可复用 GitHub 托管 SSH 部署工作流。
- 为 ChatGPT 提供可复用技能，强制执行安全顺序：检查 → 创建分支 → 修改 → 测试 → 审查 → 合并 → 部署 → 验证。

## 仓库内容

```text
.codex-plugin/plugin.json                 插件包元数据
.mcp.json                                 本地 Codex MCP 启动配置
.github/workflows/deploy-via-ssh.yml      可复用的 GHS 部署工作流
skills/autodevops/SKILL.md                操作策略与模式术语
skills/autodevops/SKILL.zh-CN.md          AutoDevOps 技能中文说明
skills/autodevops/SKILL.ja-JP.md          AutoDevOps 技能日文说明
mcp-server/                               支持 Streamable HTTP/stdio 的 MCP 服务
installer/install-runner.sh               VSR 自托管 Runner 安装程序
installer/install-ssh-deploy.sh           GHS 部署用户安装程序
examples/projects.json                    项目注册表示例
docs/DEPLOYMENT_MODES.md                  标准 VSR/GHS 契约（英文）
docs/SSH_TRANSPORT.md                     GHS 设置及调用方契约（英文）
docs/zh-CN/                               中文文档
docs/ja-JP/                               日文文档
```

## 本地单用户设置

初始实现适合私有测试。它使用仅存储在 MCP 服务器上的 GitHub fine-grained token。

```bash
cd mcp-server
cp .env.example .env
npm install
npm run build
npm start
```

Streamable HTTP 端点为 `/mcp`，健康检查端点为 `/health`。

## 受管仓库必须遵循的约定

每个受管仓库都应包含白名单工作流文件，并发布经过脱敏的状态快照：

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml

ops-status 分支：
  status/status.json
  status/STATUS.md
```

每个项目的工作流名称均可配置。

使用 `GHS` 时，应通过显式声明调用可复用 SSH 工作流：

```yaml
uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
with:
  adob_mode: GHS
  project_name: example
  ssh_host: ${{ vars.VPS_HOST }}
  ssh_user: ${{ vars.VPS_USER }}
  deploy_path: /opt/example
```

使用 `VSR` 时，应在自托管任务中明确显示模式：

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
  steps:
    - uses: actions/checkout@v4
    - run: bash scripts/deploy-production.sh "${GITHUB_SHA}"
```

## 安全原则

- 不向模型暴露任意 shell 工具。
- 不在 ChatGPT、Codex、MCP 服务、仓库源码、issue 或日志中保存 SSH 私钥。
- GHS secrets 只保存在受管项目的 GitHub Actions secret 存储中。
- GHS 固定 VPS 主机身份，绝不禁用 `StrictHostKeyChecking`。
- 只部署已测试的提交或可信分支。
- 只运行仓库内相对路径、且位于白名单中的项目部署脚本。
- 读取经过脱敏的状态，而不是 `.env` 或不受限制的日志。
- 破坏性操作必须得到显式确认。
- 所有操作都保留在 GitHub Actions 历史记录中，可供审计。

请参阅 [`docs/zh-CN/ONBOARDING.md`](docs/zh-CN/ONBOARDING.md)、[`docs/zh-CN/DEPLOYMENT_MODES.md`](docs/zh-CN/DEPLOYMENT_MODES.md)、[`docs/zh-CN/SECURITY.md`](docs/zh-CN/SECURITY.md)、[`docs/zh-CN/SSH_TRANSPORT.md`](docs/zh-CN/SSH_TRANSPORT.md) 和 [`docs/zh-CN/PUBLICATION.md`](docs/zh-CN/PUBLICATION.md)。

## 状态

此仓库包含用于私有测试的 MVP。要发布到 ChatGPT 公共目录，仍需实现 OAuth 2.1、租户隔离、经过验证的 HTTPS 服务、相关政策、审核素材以及开发者提交。

## 许可证

MIT。上游项目和服务的许可证相互独立。