# GitHub 詳細設定とクイックオンボーディング

[English](../GITHUB_SETUP.md) | [简体中文](../zh-CN/GITHUB_SETUP.md) | **日本語**

この文書では ADOB の GitHub 側設定を説明します。Docker Compose プロジェクトではオンボーディングウィザードを優先し、手動手順はレビュー、カスタムランタイム、トラブルシューティングに使用してください。

## 1. 最短の推奨フロー

```text
ローカルで GitHub CLI をインストールしてログイン
        ↓
対象リポジトリ内で setup-managed-repo.sh を実行
        ↓
生成された Draft Pull Request をレビューしてマージ
        ↓
.adob-project.json を ADOB サーバーレジストリに追加
```

ウィザードは次を自動化します。

- 対象リポジトリと書き込み権限の確認
- `adob/onboard-<project-id>` ブランチの作成
- ADOB の完全な Commit SHA の解決と固定
- CI、デプロイ、診断、ロールバック、状態公開 Workflow の生成
- Docker Compose 用アダプタースクリプトの生成
- GitHub Actions Variables の設定
- ファイルからの GHS SSH Secrets 登録
- `.adob-project.json` の生成
- 任意で Commit、Push、Draft PR 作成

## 2. 2 種類の GitHub 認証情報を分離する

### 2.1 ADOB コントロールサービス用 Token

`/etc/adob-agent/adob.env` に保存する Fine-grained personal access token は、次の用途だけに使用します。

- `ops-status` のサニタイズ済み状態を読む
- 最近の Actions 実行を確認する
- 許可リスト化された deploy、diagnose、rollback Workflow を起動する

推奨権限：

| 設定 | 推奨値 |
|---|---|
| Repository access | Only select repositories |
| Selected repositories | この ADOB が管理するリポジトリのみ |
| Metadata | Read-only |
| Contents | Read-only |
| Actions | Read and write |
| Expiration | 明確なローテーション日 |

作成パス：

```text
GitHub プロフィール画像
→ Settings
→ Developer settings
→ Personal access tokens
→ Fine-grained tokens
→ Generate new token
```

Organization のポリシーにより承認や有効期限の上限が必要な場合があります。

### 2.2 ローカル GitHub CLI 認証

`installer/setup-managed-repo.sh` はローカルの `gh` セッションを使い、Variables、Secrets、ブランチ、Draft PR を設定します。ローカルの `gh` Token を ADOB に保存することはありません。

```bash
gh --version
gh auth login
gh auth status
```

## 3. オンボーディングウィザードを実行する

```bash
gh repo clone owner/example
cd example
git status
```

作業ツリーはクリーンである必要があります。既存ファイルは `FORCE=true` を指定しない限り上書きしません。

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

less /tmp/setup-managed-repo.sh
bash -n /tmp/setup-managed-repo.sh
```

### 3.1 GHS

専用デプロイ鍵を作成します。

```bash
install -d -m 700 ~/.config/adob/example
ssh-keygen \
  -t ed25519 \
  -C 'github-actions:owner/example' \
  -f ~/.config/adob/example/id_ed25519 \
  -N ''
```

公開鍵を VPS にインストールします。

```bash
SSH_PUBLIC_KEY="$(cat ~/.config/adob/example/id_ed25519.pub)" \
DEPLOY_USER=autodevops-deploy \
DEPLOY_DIR=/opt/example \
SSH_HOST=example.com \
SSH_PORT=22 \
sudo -E bash installer/install-ssh-deploy.sh
```

インストーラーが表示する正確な `known_hosts` 行を保護されたファイルに保存し、対象プロジェクト内で実行します。

```bash
SSH_PRIVATE_KEY_FILE="$HOME/.config/adob/example/id_ed25519" \
SSH_HOST_KEY_FILE="$HOME/.config/adob/example/ssh_host_key" \
bash /tmp/setup-managed-repo.sh
```

### 3.2 VSR

まず VPS に Self-hosted Runner を導入し、GitHub 上で `Online / Idle` であることを確認します。

```bash
DEPLOYMENT_MODE=VSR \
RUNNER_LABELS_JSON='["self-hosted","linux","x64","production"]' \
bash /tmp/setup-managed-repo.sh
```

ラベルは実際の Runner と一致させてください。本番 VSR Runner で信頼できない Fork Workflow を実行してはいけません。

### 3.3 非対話実行

```bash
NON_INTERACTIVE=true \
TARGET_REPO=owner/example \
PROJECT_ID=example \
PROJECT_NAME='Example App' \
PRODUCTION_BRANCH=main \
DEPLOYMENT_MODE=GHS \
DEPLOY_PATH=/opt/example \
VPS_HOST=example.com \
VPS_PORT=22 \
VPS_USER=autodevops-deploy \
PUBLIC_HEALTH_URL=https://example.com/health \
SSH_PRIVATE_KEY_FILE="$HOME/.config/adob/example/id_ed25519" \
SSH_HOST_KEY_FILE="$HOME/.config/adob/example/ssh_host_key" \
COMMIT_AND_PR=true \
bash /tmp/setup-managed-repo.sh
```

## 4. 生成されるファイル

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/adob-ci.sh
scripts/deploy-production.sh
scripts/diagnose-production.sh
scripts/rollback-production.sh
scripts/publish-status.sh
.adob-project.json
```

Docker Compose プロファイルは `.env`、`.deploy`、一般的な data/upload/storage/volume/backup ディレクトリを保持し、デプロイロック、正確なリリースソース保持、Compose 状態確認、制限付き診断、`ROLLBACK` の明示確認を提供します。

マージ前に永続データの除外パスとヘルス確認を必ずレビューしてください。Docker Compose 以外では同じ契約を満たす 4 つの本番スクリプトを実装します。

## 5. Repository Variables

パス：

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Variables
```

### GHS

| 名前 | 例 | 必須 |
|---|---|---:|
| `ADOB_MODE` | `GHS` | はい |
| `ADOB_PROJECT_ID` | `example` | はい |
| `ADOB_PROJECT_NAME` | `Example App` | 推奨 |
| `VPS_HOST` | `example.com` | はい |
| `VPS_PORT` | `22` | はい |
| `VPS_USER` | `autodevops-deploy` | はい |
| `DEPLOY_PATH` | `/opt/example` | はい |
| `PUBLIC_HEALTH_URL` | `https://example.com/health` | 任意 |

### VSR

| 名前 | 例 | 必須 |
|---|---|---:|
| `ADOB_MODE` | `VSR` | はい |
| `ADOB_PROJECT_ID` | `example` | はい |
| `ADOB_PROJECT_NAME` | `Example App` | 推奨 |
| `ADOB_RUNNER_LABELS_JSON` | `["self-hosted","linux","x64","production"]` | はい |
| `DEPLOY_PATH` | `/opt/example` | はい |
| `PUBLIC_HEALTH_URL` | `https://example.com/health` | 任意 |

Variables はマスクされないため、機密情報を保存しないでください。

```bash
gh variable list --repo owner/example
gh variable set DEPLOY_PATH --repo owner/example --body /opt/example
```

## 6. Repository Secrets

パス：

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Secrets
```

GHS では次が必要です。

| 名前 | 内容 |
|---|---|
| `SSH_PRIVATE_KEY` | 専用デプロイ秘密鍵の完全な内容 |
| `SSH_HOST_KEY` | VPS の正確な 1 行 `known_hosts` エントリ |

```bash
gh secret set SSH_PRIVATE_KEY --repo owner/example < ~/.config/adob/example/id_ed25519
gh secret set SSH_HOST_KEY --repo owner/example < ~/.config/adob/example/ssh_host_key
gh secret list --repo owner/example
```

アップロード後、GitHub から Secret の元の値を読み戻すことはできません。ローテーション時は同名 Secret を上書きします。

## 7. Actions 設定

```text
Repository
→ Settings
→ Actions
→ General
```

GitHub 公式 Action と `b8vipvip/ADOB` の再利用可能 Workflow を許可します。制限付き allow-list の例：

```text
actions/*
github/*
b8vipvip/ADOB/.github/workflows/*@*
```

可能であれば既定の Workflow Token 権限は読み取り専用にし、状態 Workflow の YAML だけが明示的に `contents: write` を要求する構成にします。

Organization ポリシーが書き込みを禁止すると、`ops-status` 更新は `403` になります。管理者による許可が必要です。

Actions に PR の作成・承認を許可する設定は不要です。オンボーディング PR はローカル `gh` が作成します。

## 8. 本番ブランチ保護

`main` または設定済み本番ブランチに Ruleset / Branch protection rule を設定します。

推奨：

- Pull Request 経由のマージ
- チームでは 1 件以上の承認
- `CI / test` の成功
- Review 会話の解決
- Force push 禁止
- ブランチ削除禁止
- 必要に応じて管理者バイパス禁止

Required check を選ぶ前に CI を一度成功させてください。`ops-status` は機械管理ブランチなので、PR 必須ルールの対象外にします。

## 9. Workflow の役割

- `ci.yml`: PR と本番ブランチ Push でテスト
- `deploy-production.yml`: `workflow_dispatch` のみ。ADOB がこのファイルを起動
- `diagnose-production.yml`: Compose サービス名と制限された行数・期間だけを受け付ける
- `rollback-production.yml`: `ROLLBACK` と任意の保持済み SHA を受け付ける
- `publish-status.yml`: 分離された `ops-status` ブランチにサニタイズ済み状態だけを公開

GHS 再利用 Workflow はウィザードにより完全な ADOB Commit SHA に固定されます。

## 10. ADOB サーバーへ登録

ウィザードが生成する `.adob-project.json` を `/etc/adob-agent/adob.env` の `AUTODEVOPS_PROJECTS_JSON` 配列へ追加し、値全体を 1 行の有効な JSON として保存して再起動します。

```bash
sudo editor /etc/adob-agent/adob.env
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --build
curl http://127.0.0.1:8787/health
```

## 11. 初回検証順序

1. オンボーディング PR をマージ
2. `CI` 成功を確認
3. GHS: 2 つの SSH Secret を確認
4. VSR: Runner が `Online / Idle` であることを確認
5. `DEPLOY_PATH` に本番 `.env` を作成
6. `Publish production status` を手動実行
7. `ops-status/status/status.json` に Secret やユーザーデータがないことを確認
8. ADOB にプロジェクトを登録
9. Agent でプロジェクト一覧と状態を読み取る
10. 読み取り確認後にのみデプロイを試す

## 12. トラブルシューティング

### `Resource not accessible by integration`

`contents: write`、Organization の Token ポリシー、`ops-status` に適用された Ruleset を確認します。

### Workflow が見つからない

レジストリのファイル名、本番ブランチへのマージ、`workflow_dispatch`、ADOB Token の Actions 権限を確認します。

### `Bad credentials` / `403`

Token の期限、対象リポジトリ、Contents Read、Actions Read/Write、Organization 承認状態を確認します。

### `Host key verification failed`

検証を無効化しないでください。認可された VPS 管理セッションから正確なホスト鍵を取得し、`SSH_HOST_KEY` を更新します。

### `Permission denied (publickey)`

秘密鍵と登録済み公開鍵の組み合わせ、`VPS_USER`、`authorized_keys` 権限を確認します。

### `.env` がない

本番 `.env` は `DEPLOY_PATH` に直接作成します。ADOB は GitHub から `.env` をアップロードしません。

### Required check が Pending のまま

成功した実行が生成した `CI / test` を選択し、複数 Workflow で同じ Job 名を使わないでください。

## 13. セキュリティチェック

- [ ] Fine-grained ADOB Token は選択したリポジトリだけに限定
- [ ] Token の期限とローテーション担当者を設定
- [ ] GHS は専用デプロイ鍵を使用
- [ ] 秘密鍵は Actions Secrets のみに保存
- [ ] VPS ホスト識別子を固定
- [ ] 本番 `.env` を GitHub に保存しない
- [ ] 本番ブランチは PR と CI を必須化
- [ ] `ops-status` に Secret、Cookie、ユーザー記録、無制限ログを含めない
- [ ] 再利用 Workflow は完全な SHA に固定
- [ ] ロールバック前に DB マイグレーション影響を確認

## 14. 接続解除

Variables と Secrets を削除し、Workflow を無効化または削除し、ADOB サーバーレジストリからプロジェクトを削除します。使われなくなった長期デプロイ鍵を残さないでください。

```bash
gh variable delete ADOB_MODE --repo owner/example
gh variable delete ADOB_PROJECT_ID --repo owner/example
gh variable delete DEPLOY_PATH --repo owner/example
gh secret delete SSH_PRIVATE_KEY --repo owner/example
gh secret delete SSH_HOST_KEY --repo owner/example
```
