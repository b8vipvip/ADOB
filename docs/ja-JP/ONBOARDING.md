# 別のプロジェクトまたはサーバーのオンボーディング

[English](../ONBOARDING.md) | [简体中文](../zh-CN/ONBOARDING.md) | **日本語**

AutoDevOps Bridge は、1 回限りの高権限オンボーディングと継続的な自動運用を分離します。

## 最初にデプロイモードを選択する

すべての管理対象プロジェクトは、標準 ADOB デプロイモードを 1 つ宣言する必要があります。

- `VSR` — VPS Self-hosted Runner
- `GHS` — GitHub-hosted SSH

「ローカル」「リモート」「通常」「runner モード」などの曖昧な代替表現は使用しないでください。プロジェクトレジストリと管理対象ワークフローには、正確な大文字コードを記録します。選択前に [`DEPLOYMENT_MODES.md`](DEPLOYMENT_MODES.md) を参照してください。

## 両方のモードに共通する 1 回限りの作業

1. GitHub リポジトリを選択または作成する。
2. レビュー済みの CI、デプロイ、診断、ロールバック、ステータスワークフローを追加する。
3. プロジェクトの本番 `.env` をサーバー上で直接設定する。
4. サニタイズ済みステータススナップショットを `ops-status` へ公開する。
5. `AUTODEVOPS_PROJECTS_JSON` にプロジェクトを登録し、`deploymentMode: "VSR"` または `deploymentMode: "GHS"` を設定する。
6. デプロイを 1 回検証し、デプロイ済み SHA と本番ブランチ SHA を比較する。

## VSR オンボーディング

信頼済みの常駐 GitHub Runner を VPS 上に維持する場合は VSR を選択します。

1. 本番 Runner が広いローカルアクセスを持つ場合、管理対象リポジトリを非公開にする。
2. 専用の非 root Runner アカウントを作成する。
3. 有効期間の短い GitHub Runner 登録トークンを取得する。
4. サーバー上で `installer/install-runner.sh` を実行する。
5. VSR 宣言付きで本番ジョブを設定する。

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
```

GitHub の次の場所に表示される最新のアーカイブ URL と SHA256 を使用してください。

```text
Repository → Settings → Actions → Runners → New self-hosted runner
```

インストーラー例：

```bash
export GITHUB_REPOSITORY=owner/repository
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/.../actions-runner-linux-x64-....tar.gz'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='project-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/project'

bash installer/install-runner.sh
```

`RUNNER_TOKEN` が未設定の場合、インストーラーは有効期間の短い Runner トークンを安全に入力するよう求めます。

## GHS オンボーディング

GitHub ホスト Runner から、ホスト鍵を固定した SSH/rsync 経由でデプロイする場合は GHS を選択します。

1. 専用の非 root VPS デプロイアカウントを作成または選択する。
2. 許可された管理セッションで専用 SSH 鍵ペアを生成する。
3. `installer/install-ssh-deploy.sh` で公開鍵をインストールする。
4. 秘密鍵と正確なホスト鍵行を管理対象リポジトリの GitHub Actions secrets に保存する。
5. `adob_mode: GHS` を指定して再利用可能ワークフローを呼び出す。
6. ADOB ワークフローをレビュー済みコミット SHA またはリリースタグに固定する。

GHS の完全な手順については [`SSH_TRANSPORT.md`](SSH_TRANSPORT.md) を参照してください。

## プロジェクトレジストリエントリ

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

モードは MCP サーバーによって強制されます。サーバー側レジストリが変更されるまで、異なるモードで `trigger_deploy` を呼び出すと拒否されます。

## リポジトリ契約

プラグインは、ファイル名をレジストリで変更できるものの、プロジェクトが次のレビュー済みワークフローを提供することを想定しています。

```text
deploy-production.yml
diagnose-production.yml
rollback-production.yml
publish-status.yml
```

ステータス公開処理はサニタイズ済み JSON 文書を次へ書き込みます。

```text
ops-status:status/status.json
```

ワークフローが同じ安全契約を維持する限り、プロジェクトアダプターは Docker Compose、systemd、Kubernetes、その他のランタイムを使用できます。

## 継続的なワークフロー

```text
ChatGPT モバイル/ウェブで要件を相談
          ↓
ChatGPT がプロジェクト状態と設定済み VSR/GHS モードを読み取る
          ↓
ブランチを作成して変更を実装
          ↓
GitHub ホスト CI が検証
          ↓
レビュー済み変更が本番ブランチへ入る
          ↓
VSR または GHS が許可リスト内デプロイワークフローを実行
          ↓
ステータス公開処理が ops-status を更新
          ↓
ChatGPT がデプロイ済み SHA、ヘルス、モードを検証
```

## モード変更

VSR と GHS の切り替えは、1 回限りのデプロイオプションではなくインフラ移行です。

1. 新しい実行経路を用意する。
2. 管理対象ワークフローを更新する。
3. MCP プロジェクトレジストリの `deploymentMode` を更新する。
4. 新しいコードを使って明示的なデプロイを 1 回実行する。
5. ヘルスとデプロイ済み SHA を検証する。
6. 新しい経路が成功した後にのみ古い経路を無効化する。

一方のモードから他方へ黙ってフォールバックしてはいけません。

## 境界

プラグインは、権限を持つ人またはサーバーブートストラップ機構がない状態で、所有権証明、アカウント確認、CAPTCHA、支払い、ドメインレジストラへのアクセス、初回の高権限インストールを安全に自動化できません。これらは、日常的に SSH ログをコピーさせるのではなく、1 回限りのユーザー作業として識別する必要があります。