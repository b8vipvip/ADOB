# 接入另一个项目或服务器

[English](../ONBOARDING.md) | **简体中文** | [日本語](../ja-JP/ONBOARDING.md)

AutoDevOps Bridge 将一次性的高权限接入工作与后续自动化运维分离。

## 先选择部署模式

每个受管项目都必须声明一种标准 ADOB 部署模式：

- `VSR` — VPS Self-hosted Runner；
- `GHS` — GitHub-hosted SSH。

不要使用“本地”“远程”“普通”或“runner 模式”等模糊替代词。请在项目注册表和受管工作流中记录准确的大写代码。选择前请阅读 [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md)。

## 两种模式共有的一次性操作

1. 选择或创建 GitHub 仓库。
2. 添加经过审查的 CI、部署、诊断、回滚和状态工作流。
3. 直接在服务器上配置项目的生产 `.env`。
4. 将脱敏状态快照发布到 `ops-status`。
5. 在 `AUTODEVOPS_PROJECTS_JSON` 中注册项目，并设置 `deploymentMode: "VSR"` 或 `deploymentMode: "GHS"`。
6. 验证一次部署，并将已部署 SHA 与生产分支 SHA 进行比较。

## VSR 接入

当可信的常驻 GitHub Runner 将保留在 VPS 上时，选择 VSR。

1. 如果生产 Runner 具有广泛本地访问权限，请保持受管仓库为私有。
2. 创建专用非 root Runner 账户。
3. 获取短期有效的 GitHub Runner 注册令牌。
4. 在服务器上运行 `installer/install-runner.sh`。
5. 使用 VSR 声明配置生产任务：

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
```

请使用 GitHub 以下位置显示的当前压缩包 URL 和 SHA256：

```text
Repository → Settings → Actions → Runners → New self-hosted runner
```

安装示例：

```bash
export GITHUB_REPOSITORY=owner/repository
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/.../actions-runner-linux-x64-....tar.gz'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='project-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/project'

bash installer/install-runner.sh
```

如果未设置 `RUNNER_TOKEN`，安装程序会安全地提示输入短期 Runner 令牌。

## GHS 接入

当部署将从 GitHub 托管 Runner 通过固定主机密钥的 SSH/rsync 发起时，选择 GHS。

1. 创建或选择专用的非 root VPS 部署账户。
2. 在授权的管理员会话中生成专用 SSH 密钥对。
3. 使用 `installer/install-ssh-deploy.sh` 安装公钥。
4. 将私钥和准确的主机密钥行保存到受管仓库的 GitHub Actions secrets。
5. 使用 `adob_mode: GHS` 调用可复用工作流。
6. 将 ADOB 工作流固定到经过审查的提交 SHA 或发布标签。

完整 GHS 流程请参阅 [`SSH_TRANSPORT.md`](SSH_TRANSPORT.md)。

## 项目注册表条目

```json
{
  "id": "project-id",
  "name": "Project Name",
  "repo": "owner/repository",
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

模式由 MCP 服务器强制执行。在服务器端注册表变更前，使用不同模式调用 `trigger_deploy` 会被拒绝。

## 仓库契约

插件期望项目提供以下经过审查的工作流，文件名可在注册表中更改：

```text
deploy-production.yml
diagnose-production.yml
rollback-production.yml
publish-status.yml
```

状态发布器将脱敏 JSON 文档写入：

```text
ops-status:status/status.json
```

项目适配器可以使用 Docker Compose、systemd、Kubernetes 或其他运行时，只要工作流保持相同的安全契约。

## 日常工作流

```text
在 ChatGPT 移动端/网页端讨论需求
          ↓
ChatGPT 读取项目状态和已配置的 VSR/GHS 模式
          ↓
创建分支并实施变更
          ↓
GitHub 托管 CI 进行验证
          ↓
经过审查的变更进入生产分支
          ↓
VSR 或 GHS 执行白名单部署工作流
          ↓
状态发布器更新 ops-status
          ↓
ChatGPT 验证已部署 SHA、健康状态和模式
```

## 更改模式

在 VSR 与 GHS 之间切换属于基础设施迁移，不是一次性的部署选项。

1. 配置新的执行路径。
2. 更新受管工作流。
3. 更新 MCP 项目注册表中的 `deploymentMode`。
4. 使用新代码执行一次显式部署。
5. 验证健康状态和已部署 SHA。
6. 仅在新路径成功后禁用旧路径。

绝不能从一种模式静默回退到另一种模式。

## 边界

如果没有获得授权的人员或服务器初始化机制，插件无法安全地自动完成所有权证明、账户验证、CAPTCHA、付款、域名注册商访问或初始高权限安装。它应将这些步骤识别为一次性用户操作，而不是要求用户反复复制 SSH 日志。