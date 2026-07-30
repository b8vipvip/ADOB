# ADOB 部署模式：VSR 与 GHS

[English](../DEPLOYMENT_MODES.md) | **简体中文** | [日本語](../ja-JP/DEPLOYMENT_MODES.md)

ADOB 使用一套自动化开发生命周期和两种生产执行模式。模式代码是项目契约的一部分，必须始终使用大写形式。

## 标准名称

### VSR — VPS Self-hosted Runner（VPS 自托管 Runner）

```text
GitHub Actions
      ↓
VPS 上常驻的自托管 Runner
      ↓
白名单中的项目部署脚本
```

VSR 直接在目标 VPS 上运行 GitHub Actions 任务。由于 Runner 已经在生产主机内部执行，因此不需要额外的部署 SSH 跳转。

适合使用 VSR 的情况：

- 可以在 VPS 上持续安装并运行专用、可信的 Runner；
- 需要方便地直接执行本地诊断、状态发布、部署和回滚任务；
- 仓库已防止不安全的 fork 工作流进入生产 Runner；
- Runner 账户和 Docker 访问权限可按生产级权限管理。

主要运维特征：

- VPS 上存在常驻 Runner 服务；
- 能最快访问本地服务和文件；
- 部署无需 GitHub Actions SSH 私钥；
- 必须维护 Runner 生命周期、更新和隔离；
- 绝不能让不可信工作流在生产 Runner 上执行。

### GHS — GitHub-hosted SSH（GitHub 托管 SSH）

```text
GitHub 托管 Runner
      ↓ 准确的已测试版本
固定主机密钥的 SSH + rsync
      ↓
VPS 上的专用部署账户
      ↓
白名单中的项目部署脚本
```

GHS 在 GitHub 托管 Runner 上运行编排任务。它检出准确的已测试版本，将其上传到生产目录之外的暂存目录，并通过固定主机密钥的 SSH 调用项目经过审查的部署脚本。

适合使用 GHS 的情况：

- 不希望在 VPS 上常驻 GitHub Runner；
- 项目可以在 GitHub Actions secrets 中保存专用 SSH 私钥和准确的主机密钥；
- 希望每次部署都从干净的 GitHub 托管 Runner 开始；
- VPS 直接诊断通过其他受限工作流或端点完成。

主要运维特征：

- VPS 上不需要常驻 GitHub Runner 服务；
- 部署前通过 rsync 暂存准确提交；
- 使用专用非 root 部署账户；
- 使用准确的 `known_hosts` 条目和 `StrictHostKeyChecking=yes`；
- `.env`、数据库、卷、对象存储和备份保留在 VPS 上。

## 对比

| 方面 | VSR | GHS |
|---|---|---|
| 完整名称 | VPS Self-hosted Runner | GitHub-hosted SSH |
| GitHub 任务位置 | 目标 VPS | GitHub 托管 Runner |
| 部署连接 | 无额外 SSH 跳转 | 固定主机密钥的 SSH 和 rsync |
| VPS 常驻代理 | 必需 | 不需要 |
| GitHub SSH secrets | 部署时不需要 | 必需 |
| 本地诊断 | 直接且方便 | 通常通过单独的受限工作流/API |
| 主要风险边界 | 生产 Runner 执行仓库工作流 | SSH 密钥、主机密钥和部署账户 |
| 最适合 | 具有可信 Runner 的稳定私有 VPS | 希望 VPS 上常驻代理尽可能少 |

## 项目注册表声明

每个项目都应声明一种模式：

```json
{
  "id": "sumeme",
  "repo": "b8vipvip/sumeme",
  "deploymentMode": "GHS"
}
```

允许值：

```text
VSR
GHS
```

未知值会被拒绝。为兼容旧配置，如果省略 `deploymentMode`，MCP 服务器默认使用 `VSR`；生产配置应显式声明该字段。

## ChatGPT 用语

推荐请求：

```text
使用 GHS 部署 sumeme。
检查项目状态，并告诉我它配置的是 VSR 还是 GHS。
诊断最近一次 VSR 部署失败。
将此项目从 VSR 切换到 GHS，需要先更新服务器端项目注册表。
```

避免使用以下模糊说法：

```text
使用普通模式。
使用远程部署。
使用 runner 模式。
```

## MCP 调用

查询模式定义：

```json
{
  "tool": "list_deployment_modes",
  "arguments": {}
}
```

使用显式声明部署：

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

如果省略 `mode`，ADOB 使用服务器端项目注册表。如果提供的 `mode` 与注册表不一致，调用将失败。这样可防止 ChatGPT 在用户不知情的情况下调用另一条生产路径。

## GitHub Actions 声明

### VSR 任务

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
  steps:
    - uses: actions/checkout@v4
    - name: Deploy exact tested revision
      run: bash scripts/deploy-production.sh "${GITHUB_SHA}"
```

### GHS 可复用工作流

```yaml
deploy-production-ghs:
  uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
  with:
    adob_mode: GHS
    project_name: example
    ssh_host: ${{ vars.VPS_HOST }}
    ssh_port: ${{ vars.VPS_PORT || '22' }}
    ssh_user: ${{ vars.VPS_USER }}
    deploy_path: /opt/example
    deploy_script: scripts/deploy-production.sh
  secrets:
    ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
    ssh_host_key: ${{ secrets.SSH_HOST_KEY }}
```

可复用 SSH 工作流只接受 `adob_mode: GHS`，其他值都会被拒绝。

## 模式变更

模式变更属于基础设施迁移，而不是单次请求偏好。切换前应：

1. 更新并审查受管仓库工作流；
2. 配置所需 Runner 或 SSH 部署账户；
3. 更新 MCP 项目注册表中的 `deploymentMode`；
4. 使用新代码执行一次显式部署；
5. 验证已部署 SHA、健康状态和脱敏状态；
6. 仅在新路径成功后禁用旧路径。

单次部署过程中绝不能在 VSR 与 GHS 之间静默回退。

## 与 MCP 传输方式不同

以下设置彼此独立：

```text
ADOB 部署模式：VSR | GHS
MCP 连接传输：stdio | http
```

`VSR` 和 `GHS` 描述生产部署在哪里以及如何执行；`stdio` 和 `http` 描述 ChatGPT 或 Codex 如何连接 ADOB MCP 服务器。