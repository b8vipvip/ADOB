#!/usr/bin/env bash
set -Eeuo pipefail

if (( EUID != 0 )); then
  echo "Run this installer as root." >&2
  exit 77
fi

: "${SSH_PUBLIC_KEY:?Set SSH_PUBLIC_KEY to the dedicated GitHub Actions deployment public key}"

DEPLOY_USER="${DEPLOY_USER:-autodevops-deploy}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/autodevops-project}"
SSH_HOST="${SSH_HOST:-}"
SSH_PORT="${SSH_PORT:-22}"
CREATE_USER="${CREATE_USER:-true}"

[[ "${DEPLOY_USER}" =~ ^[a-z_][a-z0-9_-]*$ ]] || {
  echo "DEPLOY_USER is invalid" >&2
  exit 64
}
[[ "${DEPLOY_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "DEPLOY_DIR must be a safe absolute path" >&2
  exit 64
}
[[ "${SSH_PORT}" =~ ^[0-9]{1,5}$ ]] && (( SSH_PORT >= 1 && SSH_PORT <= 65535 )) || {
  echo "SSH_PORT must be between 1 and 65535" >&2
  exit 64
}
[[ "${SSH_PUBLIC_KEY}" == ssh-ed25519\ * || "${SSH_PUBLIC_KEY}" == ssh-rsa\ * ]] || {
  echo "SSH_PUBLIC_KEY must be an OpenSSH ed25519 or RSA public key" >&2
  exit 64
}

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 69
  }
}

for command in docker getent install sudo; do
  need "${command}"
done
docker compose version >/dev/null 2>&1 || {
  echo "The Docker Compose plugin is required" >&2
  exit 69
}

if ! command -v rsync >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
  else
    echo "Install rsync before continuing" >&2
    exit 69
  fi
fi

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  if [[ "${CREATE_USER}" != "true" ]]; then
    echo "Deployment user does not exist: ${DEPLOY_USER}" >&2
    exit 67
  fi
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
fi

DEPLOY_GROUP="$(id -gn "${DEPLOY_USER}")"
DEPLOY_HOME="$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)"
[[ -n "${DEPLOY_HOME}" && -d "${DEPLOY_HOME}" ]] || {
  echo "Unable to resolve deployment user's home directory" >&2
  exit 67
}

if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "${DEPLOY_USER}"
fi

install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" "${DEPLOY_HOME}/.ssh"
touch "${DEPLOY_HOME}/.ssh/authorized_keys"
chown "${DEPLOY_USER}:${DEPLOY_GROUP}" "${DEPLOY_HOME}/.ssh/authorized_keys"
chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys"

if ! grep -Fqx "${SSH_PUBLIC_KEY}" "${DEPLOY_HOME}/.ssh/authorized_keys"; then
  printf '%s\n' "${SSH_PUBLIC_KEY}" >> "${DEPLOY_HOME}/.ssh/authorized_keys"
fi

install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" "${DEPLOY_DIR}"
install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" \
  "${DEPLOY_DIR}.adob" \
  "${DEPLOY_DIR}.adob/incoming"

if ! sudo -u "${DEPLOY_USER}" test -w "${DEPLOY_DIR}"; then
  echo "${DEPLOY_USER} cannot write ${DEPLOY_DIR}. Fix ownership or ACLs before deployment." >&2
  exit 77
fi
if ! sudo -u "${DEPLOY_USER}" test -w "${DEPLOY_DIR}.adob/incoming"; then
  echo "${DEPLOY_USER} cannot write the ADOB staging directory." >&2
  exit 77
fi

sudo -u "${DEPLOY_USER}" docker version >/dev/null
sudo -u "${DEPLOY_USER}" docker compose version >/dev/null

if [[ -f "${DEPLOY_DIR}/.env" ]]; then
  chown "${DEPLOY_USER}:${DEPLOY_GROUP}" "${DEPLOY_DIR}/.env"
  chmod 600 "${DEPLOY_DIR}/.env"
else
  echo "WARNING: ${DEPLOY_DIR}/.env is missing. Create it before the first deployment." >&2
fi

cat <<EOF

ADOB SSH deployment user is ready.
Deploy user: ${DEPLOY_USER}
Deploy dir:  ${DEPLOY_DIR}
Staging dir: ${DEPLOY_DIR}.adob/incoming
EOF

if [[ -n "${SSH_HOST}" && -f /etc/ssh/ssh_host_ed25519_key.pub ]]; then
  HOST_KEY="$(awk '{print $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub)"
  echo
  echo "Save this exact line as the managed repository's SSH_HOST_KEY secret:"
  if [[ "${SSH_PORT}" == "22" ]]; then
    printf '%s %s\n' "${SSH_HOST}" "${HOST_KEY}"
  else
    printf '[%s]:%s %s\n' "${SSH_HOST}" "${SSH_PORT}" "${HOST_KEY}"
  fi
fi
