# ADOB — GPT–GitHub–VPS 自动化开发 Agent

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

[English](README.md) | **简体中文** | [日本語](README.ja-JP.md)

ADOB 是一个连接 **GPT、GitHub 和 VPS** 的自动化开发 Agent，把需求沟通、代码修改、测试、评审、部署、验证、诊断和回滚组织成一条可审计的闭环流程。

- **GPT / ChatGPT / Codex**：作为自然语言交互、分析、规划和控制入口。
- **GitHub**：作为代码事实源和控制平面，管理分支、Pull Request、CI、评审、工作流触发与审计记录。
- **VPS**：作为生产执行平面，负责部署、诊断、健康检查和回滚。
- **ADOB MCP 服务**：只向 AI Agent 暴露受限制的工具，不向模型提供任意 Shell，也不把 SSH 私钥交给 GPT。

目标使用体验如下：

```text
向 GPT 描述开发需求
        ↓
检查仓库、CI 和生产状态
        ↓
创建分支 → 修改代码 → 测试 → 创建 Pull Request
        ↓
通过 GitHub 评审并合并
        ↓
使用 VSR 或 GHS 部署到 VPS
        ↓
核对发布 SHA、服务健康状态和状态快照
        ↓
必要时通过白名单工作流进行诊断或回滚
```

## ADOB 可以自动完成什么

- 注册并管理一个或多个 GitHub 项目。
- 让 GPT 读取经过脱敏的生产状态和最近的 GitHub Actions 记录。
- 按照“分支—开发—测试—评审—合并”的流程推进代码变更。
- 只触发白名单中的部署、诊断和回滚工作流。
- 通过 VPS 自托管 Runner 或固定主机指纹的 SSH/rsync 部署。
- 部署后核对生产环境实际运行的 Commit。
- 将生产操作保留在 GitHub Actions 历史中，便于审计。
- 对回滚等破坏性操作要求明确确认。

ADOB 不是通用远程 Shell。仓库文本、Issue、日志、Pull Request 和上传文件都被视为不可信数据，而不是可直接执行的指令。

## 架构

```text
GPT / ChatGPT / Codex / MCP 客户端
                  │
                  │ 受限制的 MCP 工具
                  ▼
          ADOB 控制服务
                  │
                  │ GitHub API
                  ▼
       GitHub 仓库与 GitHub Actions
          │                   │
          │ VSR               │ GHS
          ▼                   ▼
VPS 自托管 Runner       GitHub 托管 Runner
          │                   │ 固定主机指纹的 SSH + rsync
          └──────────┬────────┘
                     ▼
          VPS 项目白名单脚本
                     │
                     ▼
          部署 → 验证 → 诊断 → 回滚
```

## 生产执行模式

ADOB 只有一套开发生命周期，但提供两种生产执行模式。配置时必须使用准确的大写代码。

| 代码 | 全名 | 执行路径 | 适用场景 |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner | GitHub Actions 直接在 VPS 上长期运行的 Runner 中执行 | 私有且可信的 VPS，需要直接进行本机部署和诊断 |
| `GHS` | GitHub-hosted SSH | GitHub 托管 Runner 检出已测试版本，再通过固定主机指纹的 SSH/rsync 部署 | 不希望在 VPS 长期安装 GitHub Runner |

`VSR` 和 `GHS` 描述生产部署方式，与 MCP 的 `stdio`、`http` 连接方式相互独立。

完整说明见[部署模式](docs/zh-CN/DEPLOYMENT_MODES.md)。

## 服务器一键安装

交互式脚本会在需要时安装 Docker，部署 ADOB 控制服务，创建受保护配置文件，自动生成 MCP Bearer 密钥，并可选择把同一台服务器配置成 GHS 部署目标。

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

安装过程会询问：

- GitHub Fine-grained Token；
- 要管理的 `owner/repo` 仓库；
- 项目 ID、名称、生产分支和 `VSR`/`GHS` 模式；
- 可选的 GHS 部署公钥和项目部署目录。

默认安装位置：

```text
源码与 Compose 文件： /opt/adob-agent
受保护配置文件：       /etc/adob-agent/adob.env
MCP 地址：              http://127.0.0.1:8787/mcp
健康检查：              http://127.0.0.1:8787/health
```

服务默认只监听 `127.0.0.1`。远程使用前必须放在 HTTPS 反向代理后面，不要把当前私有测试接口直接暴露到公网。

非交互安装参数和完整操作说明见[使用方法、工作流程与示例](docs/zh-CN/USAGE.md)。

## GitHub 项目一键接入

控制服务运行后，在目标项目的本地 Git 仓库中执行第二个向导：

```bash
gh auth login

curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

bash /tmp/setup-managed-repo.sh
```

对于 Docker Compose 项目，向导可以自动：

- 检查目标 GitHub 仓库和你的写入权限；
- 创建独立接入分支；
- 解析并固定准确的 ADOB Commit SHA；
- 生成 CI、部署、诊断、回滚和状态发布工作流；
- 生成受限制的项目适配脚本；
- 设置 GitHub Actions Variables，并可从文件上传 GHS Secrets；
- 生成供 ADOB 服务器注册使用的 `.adob-project.json`；
- 提交、推送并创建草稿接入 Pull Request。

除非显式设置 `FORCE=true`，向导不会覆盖已有的同名工作流或脚本。合并前必须在草稿 PR 中检查持久化目录排除规则和健康检查逻辑。

GitHub Token 权限、Variables/Secrets 完整表、Actions 设置、生产分支保护、首次验证顺序和常见报错处理见[GitHub 详细配置与快速接入](docs/zh-CN/GITHUB_SETUP.md)。

## 本地开发运行

```bash
cd mcp-server
cp .env.example .env
npm install
npm run check
npm run build
npm start
```

Streamable HTTP 入口为 `/mcp`，健康检查入口为 `/health`。

## 被管理项目需要满足的约定

每个被管理仓库都应包含经过评审的工作流，以及一个经过脱敏的状态发布器：

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

工作流文件名可以在项目注册表中调整。

项目注册示例：

```json
{
  "id": "example",
  "name": "Example App",
  "repo": "owner/example",
  "productionBranch": "main",
  "statusBranch": "ops-status",
  "statusPath": "status/status.json",
  "deploymentMode": "GHS",
  "workflows": {
    "deploy": "deploy-production.yml",
    "diagnose": "diagnose-production.yml",
    "rollback": "rollback-production.yml"
  }
}
```

## GPT 使用示例

```text
检查 example 项目的仓库状态、未合并 PR、最近 CI、生产 SHA、服务健康状态和当前部署模式，暂时不要修改生产环境。
```

```text
在新分支修复登录超时问题，补充或更新测试，运行 CI，检查 Diff 后创建 Pull Request，不要直接推送到 main。
```

```text
使用 GHS 将 example 项目已经测试通过的 main 分支部署到 VPS。部署完成后核对生产 SHA 是否与 main 一致，并检查健康接口。
```

```text
诊断 example 最近一次部署失败。只收集经过脱敏并限制范围的诊断信息，先解释失败步骤，再提出修复方案。
```

```text
准备把 example 回滚到 Commit <SHA>。先说明应用与数据库风险，只有在我输入字面确认值 ROLLBACK 后才能执行。
```

更多完整场景见[使用方法、工作流程与示例](docs/zh-CN/USAGE.md)。

## 安全模型

- 不向模型暴露任意 `shell`、`ssh` 或 `exec` 工具。
- GitHub Token 只保存在 ADOB 控制服务中。
- GHS 私钥只保存在被管理仓库的 GitHub Actions Secrets 中。
- 固定 VPS 主机身份，绝不关闭 `StrictHostKeyChecking`。
- 只能运行仓库内相对路径的白名单部署脚本。
- 生产 `.env`、数据库、对象存储、数据卷和备份保留在 VPS。
- 状态和诊断内容必须脱敏且限制范围。
- 回滚必须提供字面确认值 `ROLLBACK`。
- 所有生产操作都应保留 GitHub Actions 审计记录。

完整说明见[安全模型](docs/zh-CN/SECURITY.md)。

## 文档

| 主题 | English | 简体中文 | 日本語 |
|---|---|---|---|
| 使用方法、流程与示例 | [Open](docs/USAGE.md) | [打开](docs/zh-CN/USAGE.md) | [開く](docs/ja-JP/USAGE.md) |
| GitHub 详细配置 | [Open](docs/GITHUB_SETUP.md) | [打开](docs/zh-CN/GITHUB_SETUP.md) | [開く](docs/ja-JP/GITHUB_SETUP.md) |
| 部署模式 | [Open](docs/DEPLOYMENT_MODES.md) | [打开](docs/zh-CN/DEPLOYMENT_MODES.md) | [開く](docs/ja-JP/DEPLOYMENT_MODES.md) |
| 项目与服务器接入 | [Open](docs/ONBOARDING.md) | [打开](docs/zh-CN/ONBOARDING.md) | [開く](docs/ja-JP/ONBOARDING.md) |
| GHS SSH 部署 | [Open](docs/SSH_TRANSPORT.md) | [打开](docs/zh-CN/SSH_TRANSPORT.md) | [開く](docs/ja-JP/SSH_TRANSPORT.md) |
| 安全模型 | [Open](docs/SECURITY.md) | [打开](docs/zh-CN/SECURITY.md) | [開く](docs/ja-JP/SECURITY.md) |
| 发布检查清单 | [Open](docs/PUBLICATION.md) | [打开](docs/zh-CN/PUBLICATION.md) | [開く](docs/ja-JP/PUBLICATION.md) |
| Agent 操作技能 | [Open](skills/autodevops/SKILL.md) | [打开](skills/autodevops/SKILL.zh-CN.md) | [開く](skills/autodevops/SKILL.ja-JP.md) |

## 仓库结构

```text
.codex-plugin/plugin.json                 Agent 包元数据
.mcp.json                                 本地 MCP 启动配置
.github/workflows/*-via-ssh.yml           可复用的 GHS 生产工作流
skills/autodevops/                        Agent 操作规则和提示
mcp-server/                               Streamable HTTP/stdio MCP 控制服务
installer/bootstrap-server.sh             服务器一键配置脚本
installer/setup-managed-repo.sh           GitHub 项目接入向导
installer/install-runner.sh               VSR 自托管 Runner 安装器
installer/install-ssh-deploy.sh           GHS 部署用户安装器
templates/managed-repo/                   自动生成的工作流和适配脚本模板
examples/projects.json                    项目注册表示例
docs/                                     架构、接入、安全与使用文档
```

## 当前状态

仓库目前提供适合私有、自托管使用的 MVP。若要发布为公开多用户 ChatGPT 应用，仍需 OAuth 2.1、租户隔离、加密 Token 存储、经过验证的 HTTPS 服务、隐私与服务条款、审核素材和平台提交。

## 开源协议与署名

项目采用 [Apache License 2.0](LICENSE)，允许修改、二次开发、分发和商业使用。

衍生版本和商业产品必须保留许可证及 [NOTICE](NOTICE) 中的署名信息，包括原作者和项目来源：

```text
原作者：b8vipvip
来源：https://github.com/b8vipvip/ADOB
```
