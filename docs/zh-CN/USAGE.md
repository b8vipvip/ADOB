# GPT–GitHub–VPS 自动化开发 Agent 使用指南

[English](../USAGE.md) | **简体中文** | [日本語](../ja-JP/USAGE.md)

本文说明 ADOB 如何连接 GPT 客户端、GitHub 仓库和 VPS，如何安装控制服务，一次完整的自动化开发流程如何运行，以及怎样向 Agent 提出安全、清晰、可执行的请求。

## 1. 组件与职责

| 组件 | 主要职责 | 保存在这里的密钥 |
|---|---|---|
| GPT / ChatGPT / Codex / MCP 客户端 | 理解需求、检查状态、制定计划并调用受限制工具 | 不保存 GitHub Token 或 SSH 私钥 |
| ADOB 控制服务 | 项目白名单、MCP 工具、GitHub API 调用和部署模式校验 | Fine-grained GitHub Token、可选 MCP Bearer 密钥 |
| GitHub | 代码、分支、Pull Request、CI、Actions 工作流和审计历史 | GHS SSH 私钥及准确 VPS 主机公钥，存放于 Actions Secrets |
| VPS | 应用运行、生产 `.env`、数据库、数据卷、健康检查和部署脚本 | 生产应用密钥 |

GPT 客户端不应获得不受限制的生产凭据。

## 2. 准备条件

控制服务器需要：

- Debian 或 Ubuntu；
- root 或 `sudo` 权限；
- 能访问 GitHub 和系统软件源；
- 只授权给目标仓库的 Fine-grained GitHub Token。

每个被管理项目需要：

- GitHub 仓库；
- CI 和白名单部署、诊断、回滚工作流；
- 经过脱敏的 `ops-status` 状态快照；
- VSR Runner 或 GHS 部署账号中的一种。

Token 权限取决于启用的工具。私有测试通常需要目标仓库的 Metadata、Contents 读取权限，以及 Actions 读取和触发权限。只授予实际需要的最小权限。

## 3. 在服务器安装 ADOB 控制服务

### 交互式安装

先下载并检查脚本，再使用 root 执行：

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
less /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

脚本会依次：

1. 检查 Debian/Ubuntu 和 root 权限；
2. 在需要时安装 `git`、`curl`、`jq`、OpenSSL、Docker 和 Docker Compose；
3. 隐藏输入 GitHub Token；
4. 交互生成一个项目配置，或读取完整项目 JSON；
5. 将指定版本的 ADOB 安装到 `/opt/adob-agent`；
6. 把密钥写入 `/etc/adob-agent/adob.env`，权限设为 `600`；
7. 使用 Docker Compose 构建并启动 MCP 控制服务；
8. 等待 `/health` 健康检查通过；
9. 可选地把同一台 VPS 配置为 GHS 部署目标。

### 主要安装变量

| 变量 | 默认值 | 作用 |
|---|---|---|
| `ADOB_REF` | `main` | 要安装的分支、标签或 Commit |
| `ADOB_SOURCE_DIR` | `/opt/adob-agent` | 源码和 Compose 管理目录 |
| `ADOB_CONFIG_DIR` | `/etc/adob-agent` | 受保护的运行配置目录 |
| `ADOB_BIND_ADDRESS` | `127.0.0.1` | Docker 对宿主机发布的地址 |
| `ADOB_PORT` | `8787` | MCP 与健康检查宿主机端口 |
| `AUTODEVOPS_ALLOWED_HOSTS` | `127.0.0.1,localhost` | 允许的 HTTP Host 请求头 |
| `GITHUB_TOKEN_FILE` | 空 | 存放 Fine-grained GitHub Token 的文件 |
| `AUTODEVOPS_PROJECTS_JSON` | 交互生成 | 完整项目注册表 JSON 数组 |
| `MCP_SHARED_SECRET` | 自动生成 | `/mcp` 所需 Bearer 密钥 |
| `CONFIGURE_GHS_TARGET` | `ask` | `true`、`false` 或交互询问 |

自动化部署时，建议把 Token 放在只有 root 可读的文件中，不要直接写进命令历史：

```bash
sudo install -d -m 700 /root/.secrets
sudo sh -c 'umask 077; cat > /root/.secrets/adob-github-token'
```

然后运行：

```bash
sudo env \
  GITHUB_TOKEN_FILE=/root/.secrets/adob-github-token \
  PROJECT_REPO=owner/example \
  PROJECT_ID=example \
  PROJECT_NAME='Example App' \
  PRODUCTION_BRANCH=main \
  DEPLOYMENT_MODE=GHS \
  CONFIGURE_GHS_TARGET=false \
  bash /tmp/adob-bootstrap.sh
```

管理多个项目时，可以通过受保护的环境文件或配置系统提供完整 JSON：

```json
[
  {
    "id": "frontend",
    "name": "Frontend",
    "repo": "owner/frontend",
    "productionBranch": "main",
    "statusBranch": "ops-status",
    "statusPath": "status/status.json",
    "deploymentMode": "GHS",
    "workflows": {
      "deploy": "deploy-production.yml",
      "diagnose": "diagnose-production.yml",
      "rollback": "rollback-production.yml"
    }
  },
  {
    "id": "api",
    "name": "API",
    "repo": "owner/api",
    "productionBranch": "main",
    "statusBranch": "ops-status",
    "statusPath": "status/status.json",
    "deploymentMode": "VSR",
    "workflows": {
      "deploy": "deploy-production.yml",
      "diagnose": "diagnose-production.yml",
      "rollback": "rollback-production.yml"
    }
  }
]
```

### 验证和管理控制服务

```bash
curl http://127.0.0.1:8787/health
sudo docker compose -f /opt/adob-agent/compose.yaml ps
sudo docker compose -f /opt/adob-agent/compose.yaml logs -f
```

只在配置客户端时读取自动生成的 MCP Bearer 密钥：

```bash
sudo sed -n 's/^MCP_SHARED_SECRET=//p' /etc/adob-agent/adob.env
```

更新安装版本：

```bash
sudo env ADOB_REF=main GITHUB_TOKEN_FILE=/root/.secrets/adob-github-token \
  AUTODEVOPS_PROJECTS_JSON="$(sudo sed -n 's/^AUTODEVOPS_PROJECTS_JSON=//p' /etc/adob-agent/adob.env)" \
  CONFIGURE_GHS_TARGET=false \
  bash /tmp/adob-bootstrap.sh
```

更换服务器前，应安全备份 `/etc/adob-agent/adob.env`。

## 4. 安全暴露 MCP 地址

默认地址只供本机访问：

```text
http://127.0.0.1:8787/mcp
```

远程 MCP 客户端接入时：

1. 继续让 ADOB 只监听 localhost；
2. 使用 Nginx、Caddy、Traefik 或其他经过审查的反向代理；
3. 使用已验证域名和有效 HTTPS 证书；
4. 转发 `Authorization: Bearer <MCP_SHARED_SECRET>` 请求头；
5. 将 `AUTODEVOPS_ALLOWED_HOSTS` 设置为准确域名；
6. 尽可能通过防火墙或私有网络限制来源。

当前 Bearer 密钥模式适合私有测试。公开多用户服务还需要 OAuth 2.1、PKCE、租户隔离、加密 Token 存储、限流和撤销能力。

## 5. 准备被管理仓库

被管理项目通常包含：

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/deploy-production.sh
```

状态发布器把限制范围的 JSON 写入：

```text
ops-status:status/status.json
```

状态快照中不得包含 `.env`、凭据、Cookie、私人用户数据、原始数据库内容或无限制日志。

### 配置 GHS 部署目标

一键脚本可以选择调用 `installer/install-ssh-deploy.sh`。也可以单独运行：

```bash
SSH_PUBLIC_KEY="$(cat /secure/path/id_ed25519.pub)" \
DEPLOY_USER=autodevops-deploy \
DEPLOY_DIR=/opt/example \
SSH_HOST=example.com \
SSH_PORT=22 \
sudo -E bash installer/install-ssh-deploy.sh
```

把私钥和脚本打印的准确主机公钥行分别保存到 GitHub Actions Secrets。绝不能把私钥粘贴到 GPT 或 ADOB 控制服务。

### 配置 VSR 部署目标

VSR 需要短期 GitHub Runner 注册 Token，以及 GitHub 页面显示的准确 Runner 下载地址和校验值：

```bash
export GITHUB_REPOSITORY=owner/example
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/...'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='example-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/example'

sudo -E bash installer/install-runner.sh
```

不要让不可信 Fork 的工作流在生产 VSR Runner 上执行。

## 6. 连接 GPT 或 MCP 客户端

客户端需要配置：

```text
URL：          https://your-adob-domain.example/mcp
Authorization：Bearer <MCP_SHARED_SECRET>
```

本地 Codex/插件测试可以先构建 MCP 服务，再使用仓库中的 `.mcp.json`。

连接完成后，应先使用只读请求：

```text
列出所有已注册项目，并显示每个项目配置的部署模式。
```

```text
读取 example 当前状态，总结生产 SHA、健康情况和警告。
```

## 7. 完整自动化开发流程

### 阶段 A：检查

Agent 读取：

- 项目注册表和部署模式；
- 当前生产状态；
- 仓库分支与未合并 Pull Request；
- 最近的 CI 和部署记录；
- 已部署 SHA 和服务健康警告。

这一阶段不得修改生产环境。

### 阶段 B：开发

Agent 应当：

1. 创建或使用非生产分支；
2. 只做最小且完整的变更；
3. 增加或更新测试；
4. 避免无关格式化和依赖升级；
5. 检查 Diff 是否泄露密钥，并评估安全影响。

### 阶段 C：验证与评审

Agent 运行可用检查、创建 Pull Request，并明确区分已经验证的结果和推测。只有检查确实通过，才可以声明变更已经测试。

### 阶段 D：合并与部署

评审和合并后，Agent 使用项目注册表中的 `VSR` 或 `GHS` 模式触发白名单部署工作流，不能静默切换模式。

### 阶段 E：部署验证

Agent 重新读取生产状态并检查：

- 工作流成功结束；
- 已部署 SHA 与目标版本一致；
- 健康检查通过；
- 必需服务处于运行状态；
- 没有严重磁盘或内存警告。

### 阶段 F：诊断或回滚

部署失败时，只收集限制范围的诊断信息，定位失败步骤，优先采用向前修复。只有回滚比修复更安全，并且用户提供字面确认值 `ROLLBACK` 时，才允许回滚。

## 8. 完整请求示例

### 只读项目审计

```text
审计 example 项目。读取当前 ADOB 模式、脱敏生产状态、未合并 Pull Request 和最近十次工作流。分别说明哪些是已验证事实、哪些是推测、哪些需要处理，不要修改任何内容。
```

### 开发新功能

```text
为 example 后台增加 CSV 导出。先检查当前架构和测试，创建新分支，只实现最小完整变更，补充测试，运行相关检查，检查 Diff 和安全影响后创建 Pull Request。未完成评审和合并前不要部署。
```

### 修复生产故障

```text
example API 偶发返回 502。先读取生产状态和最近工作流，再为 API 服务收集限制范围的诊断信息。不要索取 .env 或原始密钥。判断最可能的根因，在分支中修复、测试并创建 Pull Request。
```

### 部署已评审版本

```text
example 的 main 已通过 CI，Pull Request 已合并。使用项目配置的 GHS 模式部署。工作流完成后，对比生产 SHA 与 main，并验证公网和本机健康检查。
```

### 受控回滚

```text
准备把 example 回滚到 <known-good-sha>。先检查当前版本，解释数据库迁移是否可能不可逆，并显示将执行的准确工作流。在我回复 ROLLBACK 前不要执行。
```

## 9. 常用运维命令

重启控制服务：

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml restart
```

更新源码后重新构建：

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --build
```

停止控制服务：

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml down
```

轮换 MCP Bearer 密钥：

```bash
new_secret="$(openssl rand -hex 32)"
sudo sed -i "s/^MCP_SHARED_SECRET=.*/MCP_SHARED_SECRET=${new_secret}/" /etc/adob-agent/adob.env
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --force-recreate
```

轮换 GitHub Token 时，编辑 `/etc/adob-agent/adob.env`，保持权限为 `600`，然后重建容器。

## 10. 安全检查清单

- 控制服务保持私有，或放在 HTTPS 后面。
- 使用只授权给指定仓库的 Fine-grained GitHub Token。
- 不在 GPT 消息中发送 GitHub Token 或 SSH 私钥。
- 保持 GHS 主机公钥校验开启。
- 保护生产分支和部署工作流。
- 生产数据不得进入上传的源码暂存目录。
- 对状态和诊断内容脱敏并限制范围。
- 部署前要求评审和 CI 通过。
- 每次生产变更后核对实际部署 SHA。
- 衍生分发时保留 Apache-2.0 许可证和 NOTICE 署名。
