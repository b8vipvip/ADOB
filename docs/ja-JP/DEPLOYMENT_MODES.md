# ADOB デプロイモード：VSR と GHS

[English](../DEPLOYMENT_MODES.md) | [简体中文](../zh-CN/DEPLOYMENT_MODES.md) | **日本語**

ADOB 自動開発エージェントの開発ライフサイクルは一つですが、本番実行モードは二つあります。正確な大文字コードを使用します。

## VSR — VPS Self-hosted Runner

GitHub Actions を VPS 上の信頼済み常駐 Runner で実行します。ローカル Docker やサービスへ直接アクセスできますが、Runner 権限は本番権限として管理し、不可信 Workflow を実行しません。

## GHS — GitHub-hosted SSH

GitHub ホスト Runner が正確なテスト済みリビジョンを取得し、固定ホスト鍵 SSH/rsync で専用非 root VPS アカウントへ転送します。`.env`、DB、アップロード、Volume、バックアップは VPS に保持します。

## 比較

| 項目 | VSR | GHS |
|---|---|---|
| Job の場所 | 対象 VPS | GitHub ホスト Runner |
| VPS 常駐 Runner | 必要 | 不要 |
| デプロイ SSH 鍵 | 不要 | 必要 |
| 主な境界 | Runner 権限 | SSH 鍵、ホスト鍵、デプロイアカウント |

## プロジェクト宣言

```json
{
  "id": "example",
  "repo": "owner/example",
  "deploymentMode": "GHS"
}
```

許可値は `VSR` と `GHS` だけです。登録情報と異なるモードの明示要求は拒否されます。

## Agent の依頼文

```text
設定済み GHS モードで example をデプロイする。
プロジェクトが VSR か GHS か確認する。
直近の VSR デプロイ失敗を診断する。
```

曖昧な「通常」「リモート」「Runner」モードは使用しません。

## 待機ロジック

VSR と GHS のどちらも数分かかる場合があります。`queued`、`waiting`、`in_progress` は非終端です。最大 300 秒待つか、独立作業後に `wait_for_workflow_run` で再確認します。

## モード変更

新しい実行経路を準備し、Workflow と登録情報を一緒に更新し、終端成功と本番確認後に旧経路を停止します。

```text
ADOB デプロイモード：VSR | GHS
MCP 接続：            stdio | http
```
