# GHS — GitHub 托管 SSH 部署

[English](../SSH_TRANSPORT.md) | **简体中文** | [日本語](../ja-JP/SSH_TRANSPORT.md)

`GHS` 是 ADOB 中 **GitHub-hosted SSH（GitHub 托管 SSH）** 的标准代码。

```text
GHS
GitHub 托管 Runner
      ↓ 准确的已测试版本
固定主机密钥的 SSH + rsync
      ↓
VPS 上白名单中的项目部署脚本
```

另一种模式是 `VSR` — VPS Self-hosted Runner。完整对比请参阅 [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md)。

## 可复用工作流

GHS 由以下工作流实现：

```text
b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml
```

该工作流在调用方仓库中检出准确的已测试 SHA，将源码树上传到生产目录之外的暂存目录，并使用以下环境变量运行调用方仓库中白名单化的部署脚本：

```text
ADOB_MODE=GHS
DEPLOY_DIR=<production path>
SOURCE_DIR=<uploaded source path>
```

项目部署脚本仍负责 Docker Compose 操作、本地健康检查、快照和回滚。

## 必需的模式声明

调用方应显式传入：

```yaml
with:
  adob_mode: GHS
```

可复用工作流只接受 `GHS`。其他值会在检出代码或配置 SSH 之前被拒绝。

## 安全规则

- SSH 私钥应存放在受管项目的 GitHub Actions secrets 中，绝不能放入 ADOB 源码、ChatGPT、Codex、issue、日志或 MCP 服务器。
- 使用专用非 root 部署账户。Docker 组成员资格属于生产级权限，必须按此级别管理。
- 使用从 VPS 复制的准确 `known_hosts` 行固定 VPS 主机密钥。
- 工作流使用 `StrictHostKeyChecking=yes`；不会回退到 `ssh-keyscan`，也不会禁用验证。
- 调用方提供仓库相对路径的部署脚本。ADOB 不接受任意远程命令。
- `.env`、数据库、对象存储、卷和备份保留在 VPS 上，并从 rsync 中排除。
- 调用方应固定到 ADOB 的提交 SHA 或经过审查的发布标签，而不是未固定的分支。

## VPS 初始化

在安全的管理员会话中生成专用密钥对：

```bash
install -d -m 700 /root/adob-deploy-key
ssh-keygen \
  -t ed25519 \
  -C "github-actions:<owner>/<repository>" \
  -f /root/adob-deploy-key/id_ed25519 \
  -N ""
```

从可信检出目录运行 ADOB 安装程序：

```bash
SSH_PUBLIC_KEY="$(cat /root/adob-deploy-key/id_ed25519.pub)" \
DEPLOY_USER="existing-or-new-deploy-user" \
DEPLOY_DIR="/opt/project" \
SSH_HOST="VPS_PUBLIC_IP_OR_SSH_HOST" \
SSH_PORT="22" \
bash installer/install-ssh-deploy.sh
```

迁移现有 VSR 部署时，复用其专用服务账户可避免更改生产目录所有权。在首次 GHS 部署和状态验证都成功之前，不要停止 VSR Runner。

安装程序会输出应保存为 GitHub secret 的准确主机密钥行。将完整私钥另存为一个 GitHub secret，并在首次部署成功后删除管理员环境中的副本。

## 调用方工作流

受管仓库在 CI 任务成功后，以可复用任务的方式调用 ADOB：

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/test.sh

  deploy-production-ghs:
    if: >-
      github.event_name == 'push' &&
      github.ref == 'refs/heads/main' &&
      vars.ADOB_MODE == 'GHS'
    needs: [test]
    uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
    with:
      adob_mode: GHS
      project_name: example
      ssh_host: ${{ vars.VPS_HOST }}
      ssh_port: ${{ vars.VPS_PORT || '22' }}
      ssh_user: ${{ vars.VPS_USER }}
      deploy_path: /opt/example
      deploy_script: scripts/deploy-production.sh
      public_health_url: https://example.com/health
    secrets:
      ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
      ssh_host_key: ${{ secrets.SSH_HOST_KEY }}
```

迁移期间，可将 VSR 任务放在相反条件下保留：

```yaml
if: vars.ADOB_MODE != 'GHS'
env:
  ADOB_MODE: VSR
```

GHS 部署验证完成后，设置：

```text
ADOB_MODE=GHS
```

随后可以停止并最终注销旧 VSR Runner。保留回退工作流源码可能有助于恢复，但它必须保持禁用，且不能在 GHS 失败后静默执行。

## 受管项目必须遵守的契约

调用方部署脚本必须：

1. 将准确的 Git SHA 作为第一个参数；
2. 从 `SOURCE_DIR` 读取已上传的检出内容；
3. 部署到 `DEPLOY_DIR`，且不替换持久化 `.env` 或数据卷；
4. 使用锁串行化生产变更；
5. 验证本地服务健康状态；
6. 成功时写入 `${DEPLOY_DIR}/.deploy/current_sha`；
7. 记录有界且脱敏的部署历史；
8. 在可行时尝试安全的代码回滚。

项目脚本成功后，ADOB 的 GHS 工作流还会检查可选的公开健康检查 URL。