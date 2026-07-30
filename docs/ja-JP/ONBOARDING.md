# 新しいプロジェクトまたはサーバーの導入

[English](../ONBOARDING.md) | [简体中文](../zh-CN/ONBOARDING.md) | **日本語**

ADOB 自動開発エージェントは、一回限りの高権限導入と日常の制限操作を分離します。

## 推奨手順

1. `installer/bootstrap-server.sh` で ADOB コントローラーを導入。
2. 対象リポジトリで `installer/setup-managed-repo.sh` を実行。
3. 自動作成された導入 PR をレビューしてマージ。
4. VSR または GHS を構成。
5. `.adob-project.json` をコントローラー登録情報に追加。
6. CI、状態発行、テストデプロイ、本番 SHA を確認。

## デプロイモード

- `VSR` — VPS Self-hosted Runner
- `GHS` — GitHub-hosted SSH

正確な大文字コードを使用します。モード変更はインフラ移行です。

## 共通作業

1. 本番ブランチを保護し CI を必須化。
2. CI、デプロイ、診断、ロールバック、状態 Workflow を追加。
3. 本番 `.env` は VPS 上で設定。
4. サニタイズ済み状態を `ops-status` に発行。
5. `AUTODEVOPS_PROJECTS_JSON` に登録。
6. キュー中・実行中が pending になることをテスト。
7. 一回デプロイし本番 SHA を確認。

## VSR

```bash
export GITHUB_REPOSITORY=owner/repository
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/...'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='project-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/project'

sudo -E bash installer/install-runner.sh
```

不可信 Fork Workflow を本番 Runner で実行しません。

## GHS

1. 専用 SSH 鍵を作成。
2. `installer/install-ssh-deploy.sh` で公開鍵を導入。
3. 秘密鍵を `SSH_PRIVATE_KEY` Secret に保存。
4. 正確なホスト鍵行を `SSH_HOST_KEY` に保存。
5. `VPS_HOST`、`VPS_PORT`、`VPS_USER`、`DEPLOY_PATH` Variables を設定。
6. ADOB Workflow をレビュー済み SHA またはタグに固定。

## 継続運用

```text
要件が ADOB Agents に入る
       ↓
リポジトリ、CI、本番状態を確認
       ↓
ブランチ実装と PR
       ↓
CI がキュー/実行中なら待機または独立作業
       ↓
レビュー済み変更を本番ブランチへ
       ↓
VSR/GHS で許可デプロイ
       ↓
Actions の終端を待つ
       ↓
ops-status 更新と本番検証
```

## モード変更

新しい実行経路、Workflow、登録情報をまとめて移行し、完了と本番検証後に旧経路を停止します。

## 境界

ADOB は、認可された担当者なしに所有権証明、CAPTCHA、支払い、法的同意、ドメイン管理、初回高権限導入を自動化しません。
