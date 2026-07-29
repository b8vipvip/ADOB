#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

: "${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY to owner/repo}"
: "${RUNNER_ARCHIVE_URL:?Set RUNNER_ARCHIVE_URL from GitHub's runner setup page}"
: "${RUNNER_ARCHIVE_SHA256:?Set RUNNER_ARCHIVE_SHA256 from GitHub's runner setup page}"

RUNNER_USER="${RUNNER_USER:-autodevops-runner}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname)-autodevops}"
RUNNER_LABELS="${RUNNER_LABELS:-autodevops-production}"
RUNNER_HOME="${RUNNER_HOME:-/home/${RUNNER_USER}/actions-runner}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/${GITHUB_REPOSITORY##*/}}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

for command in curl sha256sum tar git rsync systemctl; do
  need "${command}"
done

if ! id "${RUNNER_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${RUNNER_USER}"
fi

if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "${RUNNER_USER}"
fi

install -d -o "${RUNNER_USER}" -g "${RUNNER_USER}" -m 750 "${RUNNER_HOME}"
install -d -o "${RUNNER_USER}" -g "${RUNNER_USER}" -m 750 "${DEPLOY_DIR}"

archive="$(mktemp --suffix=.tar.gz)"
cleanup() {
  rm -f "${archive}"
  unset RUNNER_TOKEN || true
}
trap cleanup EXIT

curl --fail --location --retry 5 --retry-delay 2 --output "${archive}" "${RUNNER_ARCHIVE_URL}"
echo "${RUNNER_ARCHIVE_SHA256}  ${archive}" | sha256sum -c -
tar -xzf "${archive}" -C "${RUNNER_HOME}"
chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_HOME}"

if [[ -z "${RUNNER_TOKEN:-}" ]]; then
  read -rsp "Paste the short-lived GitHub runner registration token: " RUNNER_TOKEN
  echo
fi

if [[ -z "${RUNNER_TOKEN}" ]]; then
  echo "Runner token is empty." >&2
  exit 1
fi

sudo -u "${RUNNER_USER}" --preserve-env=RUNNER_TOKEN bash -c "
  cd '${RUNNER_HOME}'
  ./config.sh \\
    --url 'https://github.com/${GITHUB_REPOSITORY}' \\
    --token \"\${RUNNER_TOKEN}\" \\
    --name '${RUNNER_NAME}' \\
    --labels '${RUNNER_LABELS}' \\
    --work '_work' \\
    --unattended \\
    --replace
"

cd "${RUNNER_HOME}"
./svc.sh install "${RUNNER_USER}"
./svc.sh start
./svc.sh status

mkdir -p /etc/needrestart/conf.d
cat >/etc/needrestart/conf.d/actions_runner_services.conf <<'EOF'
$nrconf{override_rc}{qr(^actions\.runner\..+\.service$)} = 0;
EOF

cat <<EOF

Runner installation completed.
Repository: ${GITHUB_REPOSITORY}
Runner:     ${RUNNER_NAME}
Labels:     ${RUNNER_LABELS}
Deploy dir: ${DEPLOY_DIR}

Verify the runner is Online/Idle in:
https://github.com/${GITHUB_REPOSITORY}/settings/actions/runners
EOF
