# 工作流等待、轮询与 Agent 并发任务

[English](../WORKFLOW_WAITING.md) | **简体中文** | [日本語](../ja-JP/WORKFLOW_WAITING.md)

GitHub Actions 经常需要等待 Runner、安装依赖、构建镜像、传输发布包或等待环境审批。ADOB 不能把尚未结束的任务误判为失败或阻塞。

## 状态规则

| GitHub 状态/结论 | ADOB 判断 | Agent 行为 |
|---|---|---|
| `queued`、`requested`、`pending`、`waiting` | 排队中，非终态 | 等待或并发完成独立任务 |
| `in_progress` | 运行中，非终态 | 等待或并发完成独立任务 |
| `completed` + `success` | 成功 | 可以执行依赖它的下一步 |
| `completed` + `failure`、`cancelled`、`timed_out`、`action_required`、`startup_failure`、`stale` | 失败 | 查看日志并诊断 |
| `completed` + `neutral` 或 `skipped` | 已结束但不是失败 | 判断跳过结果是否满足依赖条件 |

只有 `status: completed` 才属于终态。

## 两种使用方式

### 立即返回、继续工作、稍后复查

当 Agent 还有其他独立工作可以处理时，使用 `wait_seconds: 0`：

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 0
}
```

触发结果会返回 `run_id`、`operation`、`ref`、`started_after` 等跟踪字段。Agent 可以继续检查代码、更新文档、准备发布说明，或者处理另一个互不依赖的项目。

执行任何依赖该任务的操作或给出最终结论前，必须复查：

```json
{
  "project_id": "example",
  "run_id": 123456789,
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

如果触发后暂时还没有发现 Run ID，可以通过操作类型和触发时间重新发现：

```json
{
  "project_id": "example",
  "operation": "deploy",
  "ref": "main",
  "started_after": "2026-07-30T10:00:00.000Z",
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

### 有上限的同步等待

当下一步直接依赖当前结果时，可以在触发工具中设置 `wait_seconds`，范围为 `1` 到 `300`：

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 300
}
```

如果五分钟后仍未结束，ADOB 返回“仍在进行”的非终态，不会返回工作流失败。

## Agent 必须遵循的规则

1. 不能因为没有立即得到完成结果就推断失败。
2. 保存每次触发返回的 tracking 对象。
3. 只并发处理不依赖当前工作流结果的任务。
4. 在部署验证、合并判断、回滚判断和最终汇报前重新检查。
5. 不能仅仅因为首次任务仍在排队或运行就重复触发相同工作流。
6. 只有 GitHub 返回终态失败结论时，才能称为失败。
7. 如果任务长时间没有进展，应报告已等待时间，并检查 Runner 在线状态、并发限制、环境审批或 GitHub 服务状态。

## 为什么单次最多等待五分钟

单次 MCP 请求必须有明确上限。五分钟足以覆盖大量 CI 和部署任务，同时避免连接无限期占用。更长的任务应采用“立即返回并稍后复查”的方式。
