# GitHub 详细配置与快速接入

[English](../GITHUB_SETUP.md) | **简体中文** | [日本語](../ja-JP/GITHUB_SETUP.md)

本文专门说明 GitHub 侧怎样配置 ADOB。推荐优先使用自动向导；手工步骤用于审查、特殊项目和故障排查。

## 1. 最短接入路线

对于使用 Docker Compose 的项目，推荐流程只有四步：

```text
本地安装并登录 GitHub CLI
        ↓
在目标项目目录运行 setup-managed-repo.sh
        ↓
审查向导创建的草稿 PR 并合并
        ↓
把 .adob-project.json 加入 ADOB 服务器注册表
```

向导会自动：

- 检查当前目录对应的 GitHub 仓库和权限；
- 创建 `adob/onboard-<project-id>` 分支；
- 固定当前 ADOB Commit SHA，而不是引用会变化的分支；
- 生成 CI、部署、诊断、回滚和状态发布工作流；
- 生成 Docker Compose 项目适配脚本；
- 设置 GitHub Actions Variables；
- 可从文件上传 GHS SSH Secrets；
- 生成 `.adob-project.json`；
- 提交、推送并创建草稿 Pull Request。

## 2. 先区分两类 GitHub 凭据

不要把下面两类凭据混在一起。

### 2.1 ADOB 控制服务 Token

它保存在 ADOB 控制服务器的 `/etc/adob-agent/adob.env`，用于：

- 读取 `ops-status` 中的脱敏状态；
- 查看最近 GitHub Actions 运行；
- 触发白名单部署、诊断和回滚工作流。

建议创建 Fine-grained personal access token，并设置：

| 项目 | 推荐设置 |
|---|---|
| Resource owner | 仓库所属个人账号或组织 |
| Repository access | Only select repositories |
| Selected repositories | 只选择 ADOB 要管理的仓库 |
| Expiration | 设置明确的轮换日期 |
| Metadata | Read-only，GitHub 通常自动要求 |
| Contents | Read-only |
| Actions | Read and write |

ADOB 当前不需要使用这个 Token 修改源码、创建 PR 或读取 GitHub Secrets。

创建路径：

```text
GitHub 头像
→ Settings
→ Developer settings
→ Personal access tokens
→ Fine-grained tokens
→ Generate new token
```

如果仓库属于组织，组织可能要求管理员批准 Token，或者限制 Token 最长有效期。

### 2.2 本地 GitHub CLI 登录

`installer/setup-managed-repo.sh` 使用的是你本地 `gh` 的登录身份，用于：

- 创建接入分支和草稿 PR；
- 设置仓库 Variables；
- 设置仓库 Secrets；
- 查询仓库默认分支和你的写入权限。

它不会把本地 `gh` Token 写入目标仓库或 ADOB 配置文件。

安装并登录：

```bash
gh --version
gh auth login
gh auth status
```

建议选择：

```text
GitHub.com
HTTPS
Login with a web browser
```

## 3. 使用自动 GitHub 接入向导

### 3.1 准备目标仓库

在本机克隆并进入要接入 ADOB 的项目：

```bash
gh repo clone owner/example
cd example
git status
```

工作区必须干净。向导不会覆盖已有工作流或脚本，除非显式设置 `FORCE=true`。

下载并检查向导：

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

less /tmp/setup-managed-repo.sh
bash -n /tmp/setup-managed-repo.sh
```

### 3.2 GHS 推荐方式

先创建专用部署密钥：

```bash
install -d -m 700 ~/.config/adob/example
ssh-keygen \
  -t ed25519 \
  -C 'github-actions:owner/example' \
  -f ~/.config/adob/example/id_ed25519 \
  -N ''
```

把公钥安装到 VPS：

```bash
SSH_PUBLIC_KEY="$(cat ~/.config/adob/example/id_ed25519.pub)" \
DEPLOY_USER=autodevops-deploy \
DEPLOY_DIR=/opt/example \
SSH_HOST=example.com \
SSH_PORT=22 \
sudo -E bash installer/install-ssh-deploy.sh
```

安装器会输出准确的 `known_hosts` 行。将这一整行保存到文件，例如：

```bash
cat > ~/.config/adob/example/ssh_host_key <<'EOF'
example.com ssh-ed25519 AAAA...
EOF
chmod 600 ~/.config/adob/example/ssh_host_key
```

然后在目标项目目录运行：

```bash
SSH_PRIVATE_KEY_FILE="$HOME/.config/adob/example/id_ed25519" \
SSH_HOST_KEY_FILE="$HOME/.config/adob/example/ssh_host_key" \
bash /tmp/setup-managed-repo.sh
```

向导会询问：

- 生产分支；
- 项目 ID 和显示名称；
- `GHS` 或 `VSR`；
- VPS 主机、端口、部署账号和部署目录；
- 可选公共健康检查 URL；
- 是否自动创建草稿 PR。

### 3.3 VSR 推荐方式

先按照 `install-runner.sh` 在 VPS 安装自托管 Runner，并确认 GitHub 页面显示 `Online / Idle`。

在目标项目目录运行：

```bash
DEPLOYMENT_MODE=VSR \
RUNNER_LABELS_JSON='["self-hosted","linux","x64","production"]' \
bash /tmp/setup-managed-repo.sh
```

`RUNNER_LABELS_JSON` 必须与 Runner 实际标签一致。生产 Runner 不应执行来自不可信 Fork 的工作流。

### 3.4 非交互执行

适合重复接入或内部自动化：

```bash
NON_INTERACTIVE=true \
TARGET_REPO=owner/example \
PROJECT_ID=example \
PROJECT_NAME='Example App' \
PRODUCTION_BRANCH=main \
DEPLOYMENT_MODE=GHS \
DEPLOY_PATH=/opt/example \
VPS_HOST=example.com \
VPS_PORT=22 \
VPS_USER=autodevops-deploy \
PUBLIC_HEALTH_URL=https://example.com/health \
SSH_PRIVATE_KEY_FILE="$HOME/.config/adob/example/id_ed25519" \
SSH_HOST_KEY_FILE="$HOME/.config/adob/example/ssh_host_key" \
COMMIT_AND_PR=true \
bash /tmp/setup-managed-repo.sh
```

## 4. 向导创建的文件

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/adob-ci.sh
scripts/deploy-production.sh
scripts/diagnose-production.sh
scripts/rollback-production.sh
scripts/publish-status.sh
.adob-project.json
```

### 4.1 Docker Compose 适配器默认行为

- 部署前要求 VPS 已存在生产 `.env`；
- 使用文件锁避免并发部署；
- 上传并保留最近几个精确 Commit 的源码；
- `rsync --delete` 更新代码，但保留 `.env`、`.deploy`、数据、上传、存储、卷和备份目录；
- 执行 `docker compose build --pull` 和 `docker compose up -d`；
- 检查退出、死亡或不健康容器；
- 记录 `.deploy/current_sha` 和部署历史；
- 回滚只能选择仍保留的版本，并要求输入 `ROLLBACK`；
- 诊断只允许 Compose 中存在的服务名，以及 `100/200/500` 行和有限时间窗口；
- 状态文件只包含服务状态、发布 SHA、磁盘使用率和负载信息。

合并前必须根据实际项目检查持久化目录排除列表。项目若不使用 Docker Compose，请按照这些接口自行实现四个生产脚本。

## 5. GitHub Variables 详细说明

路径：

```text
目标仓库
→ Settings
→ Secrets and variables
→ Actions
→ Variables
```

### GHS Variables

| 名称 | 示例 | 是否必须 | 用途 |
|---|---|---:|---|
| `ADOB_MODE` | `GHS` | 是 | 明确生产执行模式 |
| `ADOB_PROJECT_ID` | `example` | 是 | 并发组、状态和审计标识 |
| `ADOB_PROJECT_NAME` | `Example App` | 建议 | 人类可读名称 |
| `VPS_HOST` | `example.com` | 是 | SSH 主机或公网 IP |
| `VPS_PORT` | `22` | 是 | SSH 端口 |
| `VPS_USER` | `autodevops-deploy` | 是 | 专用非 root 部署账号 |
| `DEPLOY_PATH` | `/opt/example` | 是 | 生产目录 |
| `PUBLIC_HEALTH_URL` | `https://example.com/health` | 否 | 部署和回滚后的外部健康检查 |

### VSR Variables

| 名称 | 示例 | 是否必须 | 用途 |
|---|---|---:|---|
| `ADOB_MODE` | `VSR` | 是 | 明确生产执行模式 |
| `ADOB_PROJECT_ID` | `example` | 是 | 项目标识 |
| `ADOB_PROJECT_NAME` | `Example App` | 建议 | 人类可读名称 |
| `ADOB_RUNNER_LABELS_JSON` | `["self-hosted","linux","x64","production"]` | 是 | `runs-on` 标签数组 |
| `DEPLOY_PATH` | `/opt/example` | 是 | 生产目录 |
| `PUBLIC_HEALTH_URL` | `https://example.com/health` | 否 | 外部健康检查 |

Variables 会以明文出现在工作流上下文中，因此只能保存非敏感配置。

CLI 查看和修改：

```bash
gh variable list --repo owner/example
gh variable set DEPLOY_PATH --repo owner/example --body /opt/example
```

## 6. GitHub Secrets 详细说明

路径：

```text
目标仓库
→ Settings
→ Secrets and variables
→ Actions
→ Secrets
```

GHS 需要两个仓库 Secret：

| 名称 | 内容 | 注意事项 |
|---|---|---|
| `SSH_PRIVATE_KEY` | 专用部署私钥的完整内容 | 不要使用个人日常 SSH 私钥 |
| `SSH_HOST_KEY` | VPS 准确的单行 `known_hosts` 内容 | 不能使用 `ssh-keyscan` 临时绕过 |

CLI 设置：

```bash
gh secret set SSH_PRIVATE_KEY --repo owner/example \
  < ~/.config/adob/example/id_ed25519

gh secret set SSH_HOST_KEY --repo owner/example \
  < ~/.config/adob/example/ssh_host_key

gh secret list --repo owner/example
```

GitHub 不允许再次读取 Secret 原文。轮换时直接覆盖同名 Secret。

VSR 部署本身不需要 GitHub SSH Secret。

## 7. Actions 设置

路径：

```text
目标仓库
→ Settings
→ Actions
→ General
```

### Actions permissions

需要允许：

- GitHub 官方 Actions，例如 `actions/checkout`、`actions/setup-node` 和 `actions/github-script`；
- 来自 `b8vipvip/ADOB` 的公开可复用工作流。

若使用允许列表，可加入：

```text
actions/*
github/*
b8vipvip/ADOB/.github/workflows/*@*
```

### Workflow permissions

推荐仓库默认保持：

```text
Read repository contents and packages permissions
```

生成的状态工作流会在自身 YAML 中显式声明：

```yaml
permissions:
  contents: write
```

如果组织策略禁止工作流获得写权限，`ops-status` 发布会收到 `403`。需要组织管理员允许该仓库的工作流写入 Contents。

本项目不要求启用“Allow GitHub Actions to create and approve pull requests”。接入 PR 是由本地 `gh` 创建的。

## 8. 保护生产分支

建议只对生产分支，例如 `main`，建立 Ruleset 或 Branch protection rule。

路径之一：

```text
目标仓库
→ Settings
→ Rules
→ Rulesets
```

旧版入口可能显示为：

```text
Settings
→ Branches
→ Branch protection rules
```

推荐要求：

- 合并前必须通过 Pull Request；
- 至少一个批准，团队项目建议启用；
- 必须通过 CI 状态检查；
- 必须解决所有 Review 对话；
- 禁止强制推送；
- 禁止删除生产分支；
- 根据团队情况禁止管理员绕过。

先让 `CI / test` 至少成功运行一次，再在规则中选择它作为 Required status check。不要手工创建一个从未运行过的检查名称。

`ops-status` 是机器维护的状态分支，不应套用要求 PR 审核的 `main` 规则。如果使用覆盖全部分支的 Ruleset，应排除 `ops-status`，否则状态工作流无法更新。

## 9. 工作流逐项说明

### `ci.yml`

- 在 Pull Request 和生产分支 Push 时运行；
- 自动识别 Node.js、Python、Go、Rust 和 Docker Compose；
- 项目有特殊测试命令时，直接修改 `scripts/adob-ci.sh`。

### `deploy-production.yml`

- 只允许 `workflow_dispatch`；
- ADOB MCP 的 `trigger_deploy` 调用该文件；
- GHS 调用固定 SHA 的 ADOB 可复用工作流；
- VSR 在指定 Runner 标签上执行；
- GHS 部署成功后自动发布状态。

### `diagnose-production.yml`

ADOB 只传入：

```text
service
lines = 100 | 200 | 500
since = 15m | 30m | 2h | 1d
```

不能传入任意 Shell 命令。

### `rollback-production.yml`

- 必须输入字面值 `ROLLBACK`；
- 可指定目标 SHA，留空时选择最近的另一个保留版本；
- 不承诺反向执行数据库迁移。

### `publish-status.yml`

- 可手工执行；
- 默认每六小时更新一次；
- 创建或更新孤立的 `ops-status` 分支；
- 只写入 `status/status.json` 和 `status/status.md`；
- 首次执行后必须人工检查没有凭据和用户数据。

## 10. 把项目注册到 ADOB 控制服务

向导生成 `.adob-project.json`，例如：

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

把它加入服务器 `/etc/adob-agent/adob.env` 中的 `AUTODEVOPS_PROJECTS_JSON` 数组，然后重启：

```bash
sudo editor /etc/adob-agent/adob.env
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --build
curl http://127.0.0.1:8787/health
```

不要直接把多个 JSON 对象逐行追加到 env 文件。整个值必须是有效的单行 JSON 数组。

## 11. 第一次验证顺序

按下面顺序操作，出现问题时更容易定位：

1. 合并接入 PR；
2. 打开 Actions，确认 `CI` 成功；
3. GHS：确认 `SSH_PRIVATE_KEY` 和 `SSH_HOST_KEY` 已设置；
4. VSR：确认 Runner 为 `Online / Idle`；
5. 在 VPS 生产目录创建 `.env`；
6. 手工运行 `Publish production status`；
7. 检查 `ops-status/status/status.json`；
8. 将项目注册到 ADOB 控制服务；
9. 向 GPT 请求 `list_projects`；
10. 请求读取状态；
11. 最后才尝试部署。

第一条部署指令建议使用：

```text
检查 example 的 CI、当前生产状态和部署模式。如果 CI 未成功或状态配置不完整，不要部署；否则使用配置的 GHS 模式部署 main，并在完成后核对生产 SHA 和健康状态。
```

## 12. 常见问题

### `Resource not accessible by integration`

通常原因：

- 工作流缺少 `contents: write`；
- 组织策略禁止 `GITHUB_TOKEN` 写入；
- Ruleset 阻止更新 `ops-status`。

### `workflow was not found`

检查：

- 项目注册表中的文件名；
- 工作流是否已经合并到生产分支；
- 工作流是否包含 `workflow_dispatch`；
- ADOB Token 是否拥有 Actions 权限。

### `Bad credentials` 或 `403`

检查 ADOB 控制服务 Token：

- 是否过期；
- 是否选择了该仓库；
- Contents 是否为 Read；
- Actions 是否为 Read and write；
- 组织是否尚未批准 Token。

### `Host key verification failed`

不要关闭主机校验。重新从 VPS 管理终端获取准确 SSH 主机公钥，并覆盖 `SSH_HOST_KEY`。

### `Permission denied (publickey)`

检查：

- `SSH_PRIVATE_KEY` 是否对应已安装的公钥；
- `VPS_USER` 是否正确；
- `authorized_keys` 权限；
- 密钥是否被错误换行或截断。

### 部署工作流找不到 `.env`

生产 `.env` 必须预先存在于 `DEPLOY_PATH`。ADOB 不会从仓库上传 `.env`。

### Required check 一直 Pending

确认规则中选择的是实际运行产生的检查，例如 `CI / test`，并且相同名称没有被多个工作流重复使用。

## 13. 安全检查清单

- [ ] ADOB Token 只授权选定仓库；
- [ ] ADOB Token 设置过期日期；
- [ ] GHS 使用专用部署密钥；
- [ ] SSH 私钥只保存在 GitHub Actions Secrets；
- [ ] VPS 主机公钥固定；
- [ ] 生产 `.env` 不进入 GitHub；
- [ ] `main` 受 PR 和 CI 保护；
- [ ] `ops-status` 不包含 Secret、Cookie、用户数据或完整日志；
- [ ] 可复用工作流固定到完整 Commit SHA；
- [ ] 回滚前评估数据库迁移影响。

## 14. 移除或重新接入

删除仓库配置：

```bash
gh variable delete ADOB_MODE --repo owner/example
gh variable delete ADOB_PROJECT_ID --repo owner/example
gh variable delete DEPLOY_PATH --repo owner/example
gh secret delete SSH_PRIVATE_KEY --repo owner/example
gh secret delete SSH_HOST_KEY --repo owner/example
```

然后删除或停用 ADOB 工作流，并从服务器注册表中移除项目。不要只删除工作流而保留长期不用的部署密钥。
