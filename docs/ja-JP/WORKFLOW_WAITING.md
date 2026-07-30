# Workflow の待機、ポーリング、Agent の並行作業

[English](../WORKFLOW_WAITING.md) | [简体中文](../zh-CN/WORKFLOW_WAITING.md) | **日本語**

GitHub Actions は Runner の割り当て、依存関係の導入、イメージ作成、リリース転送、環境承認などで数分かかる場合があります。ADOB は未完了の Run を失敗やブロックとして扱いません。

## 状態ポリシー

| GitHub 状態/結論 | ADOB の解釈 | Agent の動作 |
|---|---|---|
| `queued`、`requested`、`pending`、`waiting` | キュー中、非終端 | 待機または独立作業を並行実行 |
| `in_progress` | 実行中、非終端 | 待機または独立作業を並行実行 |
| `completed` + `success` | 成功 | 依存する次の処理へ進む |
| `completed` + 失敗系 conclusion | 失敗 | ログ確認と診断 |
| `completed` + `neutral` / `skipped` | 終端の非失敗 | スキップが依存条件を満たすか確認 |

終端状態は `status: completed` だけです。

## 二つの実行パターン

### 即時に戻り、独立作業後に再確認

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 0
}
```

返された `run_id`、`operation`、`ref`、`started_after` を保存し、コードレビュー、文書更新、リリースノートなどの独立作業を進めます。

依存処理または最終報告の前に再確認します。

```json
{
  "project_id": "example",
  "run_id": 123456789,
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

Run ID がまだ見つからない場合：

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

### 上限付き同期待機

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 300
}
```

5 分後も非終端なら、ADOB は継続中として返します。失敗にはしません。

## Agent ルール

1. 完了結果が直ちに得られないことを失敗と解釈しません。
2. Trigger の tracking 情報を保存します。
3. Pending Run に依存しない作業だけを並行実行します。
4. デプロイ検証、マージ、ロールバック、最終報告前に再確認します。
5. キュー中・実行中という理由だけで重複 Workflow を起動しません。
6. GitHub が終端失敗 conclusion を返した場合だけ失敗と報告します。
7. 長時間進まない場合は Runner、同時実行制限、環境承認、GitHub 状態を確認します。

## 最大 5 分の理由

一つの MCP リクエストは有界である必要があります。長いジョブでは即時戻りと再確認のパターンを使用します。
