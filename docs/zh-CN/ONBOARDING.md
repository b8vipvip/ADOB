# 接入新的项目或服务器

[English](../ONBOARDING.md) | **简体中文** | [日本語](../ja-JP/ONBOARDING.md)

ADOB 自动化开发智能体把一次性高权限接入与日常受限制操作分开。

## 推荐接入流程

1. 使用 `installer/bootstrap-server.sh` 安装 ADOB 控制服务。
2. 在本地克隆目标项目并运行 `installer/setup-managed-repo.sh`。
3. 审查并合并自动生成的接入 PR。
4. 配置 VSR 或 GHS 基础设施。
5. 把 `.adob-project.json` 加入服务端项目注册表。
6. 运行 CI、发布状态、测试部署并核对生产 SHA。

## 选择部署模式

- `VSR` — VPS Self-hosted Runner。
- `GHS` — GitHub-hosted SSH。

注册表和工作流必须使用准确的大写代码。切换模式属于基础设施迁移，不是单次请求参数。

## 两种模式共同的一次性操作

1. 保护生产分支并要求 CI。
2. 添加经过评审的 CI、部署、诊断、回滚和状态工作流。
3. 直接在 VPS 配置生产 `.env`。
4. 把脱敏状态发布到 `ops-status`。
5. 在 `AUTODEVOPS_PROJECTS_JSON` 注册项目。
6. 测试等待逻辑：排队和运行中必须保持 pending。
7. 完成一次部署并核对生产 SHA。

## VSR 接入

当可信 GitHub Runner 可以长期运行在 VPS 上时使用 VSR。

```bash
export GITHUB_REPOSITORY=owner/repository
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/...'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='project-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/project'

sudo -E bash installer/install-runner.sh
```

下载地址、校验值和短期注册 Token 从以下页面获取：

```text
Repository → Settings → Actions → Runners → New self-hosted runner
```

不能让不可信 Fork 工作流在生产 Runner 上执行。

## GHS 接入

当部署从 GitHub 托管 Runner 通过固定主机公钥 SSH/rsync 发起时使用 GHS。

1. 创建专用 SSH 密钥对。
2. 使用 `installer/install-ssh-deploy.sh` 安装公钥。
3. 私钥保存为 GitHub Actions Secret `SSH_PRIVATE_KEY`。
4. 准确主机公钥行保存为 `SSH_HOST_KEY`。
5. 设置 `VPS_HOST`、`VPS_PORT`、`VPS_USER`、`DEPLOY_PATH` Variables。
6. 被管理项目固定到经过评审的 ADOB Commit SHA 或版本标签。

## 项目注册表示例

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

## 日常智能体流程

```text
需求进入 ADOB Agents
       ↓
检查仓库、CI 和生产状态
       ↓
分支实现与 Pull Request
       ↓
CI 排队或运行时等待，或并发处理独立工作
       ↓
评审通过的变更进入生产分支
       ↓
VSR 或 GHS 执行白名单部署
       ↓
Agents 等待 GitHub Actions 终态
       ↓
更新 ops-status 并验证生产 SHA 与健康状态
```

## 切换模式

1. 配置新的 Runner 或 SSH 路径。
2. 更新并评审工作流。
3. 更新控制服务项目注册表。
4. 使用新模式执行一次明确部署。
5. 等待工作流完成并验证生产。
6. 新路径成功后才停用旧路径。

## 边界

没有授权操作员参与时，ADOB 不能安全自动执行账号所有权证明、验证码、支付、法律条款接受、域名注册商访问或首次高权限安装。
