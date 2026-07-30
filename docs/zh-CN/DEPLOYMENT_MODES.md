# ADOB 部署模式：VSR 与 GHS

[English](../DEPLOYMENT_MODES.md) | **简体中文** | [日本語](../ja-JP/DEPLOYMENT_MODES.md)

ADOB 自动化开发智能体只有一套开发生命周期，但有两种生产执行模式。必须使用准确的大写代码。

## VSR — VPS Self-hosted Runner

```text
GitHub Actions
      ↓
VPS 上长期运行的可信 Runner
      ↓
白名单项目脚本
```

适用于需要本机部署、诊断，并且能够隔离不可信工作流的环境。

特点：

- VPS 上长期运行 Runner 服务；
- 不需要额外部署 SSH 跳转；
- 可直接访问本机 Docker 和服务；
- 必须维护 Runner 更新与隔离；
- Runner 权限属于生产级权限。

## GHS — GitHub-hosted SSH

```text
GitHub 托管 Runner
      ↓ 准确的已测试版本
固定主机公钥 SSH + rsync
      ↓
VPS 专用非 root 部署账号
      ↓
白名单项目脚本
```

适用于不希望 VPS 长期运行 GitHub Runner 的环境。

特点：

- 使用干净的 GitHub 托管执行环境；
- 使用专用 SSH 密钥并固定准确主机公钥；
- 源码先暂存到生产目录外；
- `.env`、数据库、上传文件、数据卷和备份保留在 VPS；
- 必须启用 `StrictHostKeyChecking=yes`。

## 对比

| 项目 | VSR | GHS |
|---|---|---|
| Job 运行位置 | 目标 VPS | GitHub 托管 Runner |
| VPS 常驻 Runner | 需要 | 不需要 |
| 部署 SSH 私钥 | 不需要 | 需要 |
| 本机诊断 | 通过评审工作流直接执行 | 通过受限 SSH 工作流 |
| 主要安全边界 | 生产 Runner 权限 | SSH 密钥、主机公钥、部署账号 |

## 项目声明

```json
{
  "id": "example",
  "repo": "owner/example",
  "deploymentMode": "GHS"
}
```

允许值只有 `VSR` 和 `GHS`。触发请求显式指定不同模式时，服务会拒绝执行。

## Agent 请求措辞

推荐：

```text
使用项目配置的 GHS 模式部署 example。
检查该项目配置的是 VSR 还是 GHS。
诊断最近一次 VSR 部署失败。
```

避免使用“普通模式”“远程模式”“Runner 模式”等模糊词。

## 等待逻辑与部署模式无关

VSR 和 GHS 都可能排队或运行数分钟。`queued`、`waiting`、`in_progress` 都属于非终态。Agent 可以等待最多 300 秒，或并发处理独立任务后通过 `wait_for_workflow_run` 复查。

## 切换模式

1. 配置新的 Runner 或 SSH 账号；
2. 更新并评审工作流；
3. 更新控制服务注册表；
4. 使用新模式部署一次；
5. 等待终态并验证生产；
6. 成功后才停用旧路径。

## 与 MCP 连接方式不同

```text
ADOB 部署模式：VSR | GHS
MCP 连接方式：  stdio | http
```
