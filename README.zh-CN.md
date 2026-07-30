# ADOB — 面向 GitHub 与 VPS 的自动化开发智能体

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

[English](README.md) | **简体中文** | [日本語](README.ja-JP.md)

ADOB 是一套连接 AI 模型、GitHub、GitHub Actions 和 VPS 生产环境的**自动化开发智能体系统**。

它的核心是一组受约束、可审计、可协作的自动化开发 Agents，以及负责安全编排的 MCP 控制服务，可以：

- 检查仓库、Pull Request、CI 和脱敏后的生产状态；
- 在分支中实现需求、运行测试并准备评审；
- 触发白名单 GitHub Actions 工作流；
- 正确等待耗时任务，不把“仍在运行”误判成失败；
- 使用 VSR 或 GHS 部署，验证生产环境，执行受限诊断和确认后的回滚。

任何支持 MCP 或兼容 GPT 类模型的客户端都可以作为人机交互入口。GitHub 始终是代码事实源，VPS 始终是生产执行环境。

## 智能体开发流程

```text
用户提出需求
    ↓
规划与仓库检查 Agents
    ↓
创建分支 → 实现代码 → 测试 → Pull Request
    ↓
GitHub 评审与 CI
    ↓
工作流监控：排队/运行中 → 等待或并发完成其他任务
    ↓
通过 VSR 或 GHS 部署到 VPS
    ↓
验证生产 SHA 与健康状态
    ↓
必要时执行受限诊断或确认回滚
```

## 耗时 GitHub Actions 的处理逻辑

GitHub Actions 可能排队或运行数分钟。ADOB 使用明确的非终态规则：

- `queued`、`requested`、`pending`、`waiting`、`in_progress` 都**不是失败**；
- 只有 GitHub 返回 `status: completed` 后，才判断最终成功或失败；
- 触发工具设置 `wait_seconds=0` 时立即返回，Agent 可以并发处理其他独立任务；
- 触发工具最多可以轮询等待 `300` 秒；
- `wait_for_workflow_run` 可以通过 Run ID 复查，也可以根据触发时间和工作流重新发现任务；
- 等待达到上限但任务仍在运行时，返回“仍在进行”，不会判定失败或阻塞。

Agent 可以先继续整理文档、分析代码、检查 Diff 或完成其他独立工作，但在执行依赖该工作流结果的下一步或给出最终结论前，必须重新检查状态。

## 架构

```text
AI 自动化开发 Agents / MCP 客户端
              │ 受限制工具
              ▼
          ADOB MCP 控制服务
              │ GitHub API
              ▼
        GitHub 仓库与 Actions
          │                  │
          │ VSR              │ GHS
          ▼                  ▼
VPS 自托管 Runner       GitHub 托管 Runner
          │                  │ 固定主机公钥 SSH + rsync
          └─────────┬────────┘
                    ▼
             VPS 白名单脚本
                    ▼
        部署 → 验证 → 诊断 → 回滚
```

ADOB 不向模型提供不受限制的远程 Shell。仓库文本、Issue、评论、PR、日志和上传文件都属于不可信数据，而不是直接指令。

## 生产执行模式

| 代码 | 全名 | 执行路径 | 适用场景 |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner | GitHub Actions 直接在 VPS 上的可信 Runner 中执行 | 需要本机部署和诊断的私有 VPS |
| `GHS` | GitHub-hosted SSH | GitHub 托管 Runner 通过固定主机公钥的 SSH/rsync 部署 | 不希望在 VPS 长期保留 GitHub Runner |

`VSR` 和 `GHS` 描述生产执行方式，与 MCP 的 `stdio`、`http` 连接方式无关。

## 服务器一键安装

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

默认位置：

```text
源码与 Compose：   /opt/adob-agent
受保护配置：       /etc/adob-agent/adob.env
MCP 地址：          http://127.0.0.1:8787/mcp
健康检查：          http://127.0.0.1:8787/health
```

服务默认只监听本机。远程使用前应放在带身份验证的 HTTPS 反向代理后面。

## GitHub 项目一键接入

在目标项目的干净本地仓库中运行：

```bash
gh auth login

curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

bash /tmp/setup-managed-repo.sh
```

向导可以创建接入分支，生成 CI、部署、诊断、回滚和状态工作流，设置 Actions Variables，从受保护文件上传 GHS Secrets，生成 `.adob-project.json`，并创建草稿 PR。

## MCP 工作流工具

读取与跟踪工具：

- `list_projects`
- `get_project_status`
- `get_recent_workflow_runs`
- `get_workflow_run`
- `wait_for_workflow_run`

生产操作工具：

- `trigger_deploy`
- `trigger_diagnose`
- `trigger_rollback`

立即返回并继续并发工作的部署示例：

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 0
}
```

最多等待五分钟的复查示例：

```json
{
  "project_id": "example",
  "run_id": 123456789,
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

## 被管理仓库约定

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/deploy-production.sh
scripts/diagnose-production.sh
scripts/rollback-production.sh
scripts/publish-status.sh
```

脱敏生产状态发布到：

```text
ops-status:status/status.json
```

## 安全模型

- 不向模型暴露任意 `shell`、`ssh` 或 `exec` 工具。
- GitHub Token 只保存在 ADOB 控制服务。
- GHS 私钥只保存在 GitHub Actions Secrets。
- 固定 VPS 主机身份，绝不关闭 `StrictHostKeyChecking`。
- 只能执行经过评审、仓库相对路径的白名单脚本。
- 生产 `.env`、数据库、数据卷、上传文件和备份保留在 VPS。
- 诊断信息必须限制范围并脱敏。
- 回滚必须提供字面确认值 `ROLLBACK`。
- 运行中的 Actions 绝不会被误报为失败。

## 文档

| 主题 | English | 简体中文 | 日本語 |
|---|---|---|---|
| 使用方法与示例 | [Open](docs/USAGE.md) | [打开](docs/zh-CN/USAGE.md) | [開く](docs/ja-JP/USAGE.md) |
| 工作流等待与并发 | [Open](docs/WORKFLOW_WAITING.md) | [打开](docs/zh-CN/WORKFLOW_WAITING.md) | [開く](docs/ja-JP/WORKFLOW_WAITING.md) |
| GitHub 详细配置 | [Open](docs/GITHUB_SETUP.md) | [打开](docs/zh-CN/GITHUB_SETUP.md) | [開く](docs/ja-JP/GITHUB_SETUP.md) |
| 部署模式 | [Open](docs/DEPLOYMENT_MODES.md) | [打开](docs/zh-CN/DEPLOYMENT_MODES.md) | [開く](docs/ja-JP/DEPLOYMENT_MODES.md) |
| 项目与服务器接入 | [Open](docs/ONBOARDING.md) | [打开](docs/zh-CN/ONBOARDING.md) | [開く](docs/ja-JP/ONBOARDING.md) |
| 安全模型 | [Open](docs/SECURITY.md) | [打开](docs/zh-CN/SECURITY.md) | [開く](docs/ja-JP/SECURITY.md) |
| 生产就绪检查 | [Open](docs/PUBLICATION.md) | [打开](docs/zh-CN/PUBLICATION.md) | [開く](docs/ja-JP/PUBLICATION.md) |

## 仓库结构

```text
.mcp.json                                 本地 MCP 启动配置
skills/autodevops/                        智能体操作规则
mcp-server/                               MCP 控制服务与工作流跟踪器
installer/bootstrap-server.sh             服务器安装向导
installer/setup-managed-repo.sh           GitHub 项目接入向导
templates/managed-repo/                   工作流和适配模板
docs/                                     架构、配置、安全和运维文档
```

## 开源协议与署名

项目采用 [Apache License 2.0](LICENSE)，允许修改、二次开发、分发和商业使用。衍生版本必须保留许可证及 [NOTICE](NOTICE) 中的署名信息。

```text
原作者：b8vipvip
来源：https://github.com/b8vipvip/ADOB
```
