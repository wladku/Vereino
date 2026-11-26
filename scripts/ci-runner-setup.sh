#!/usr/bin/env bash
# Self-hosted CI runners on the factory server (#834). Runbook: docs/ops/ci-runners.md.
#
#   sudo scripts/ci-runner-setup.sh install   # user, rootless Docker, Node, browser libraries, runner, systemd units
#   sudo scripts/ci-runner-setup.sh start     # start the runner slots (needs the GitHub token file, below)
#   sudo scripts/ci-runner-setup.sh stop      # stop and disable every slot (CI falls back once CI_SELF_HOSTED is unset)
#   sudo scripts/ci-runner-setup.sh status    # slots, resource caps, rootless Docker, home-directory audit
#
# Run it as root from a checkout of the repository; `install` is idempotent and is rerun after a change to this
# script, `.nvmrc` or the Playwright version. It never registers a runner by itself: each slot asks GitHub for a
# just-in-time (JIT) runner configuration when it starts, with the token the owner puts in $TOKEN_FILE, runs exactly
# one job and exits; systemd then starts it again with a fresh registration. The token never reaches the runner user.
#
# What it builds:
#   - the system user $CI_USER (no sudo, not in the docker group, home 0750) with rootless Docker, so Testcontainers
#     and `docker build` never touch the system Docker socket;
#   - $SLOTS slots `vereino-ci-runner@<n>.service`, each an ephemeral runner with the labels self-hosted, Linux, X64 and
#     vereino-ci, in the slice of $CI_USER together with its rootless Docker, capped by $CPU_QUOTA and $MEMORY_MAX;
#   - a daily `vereino-ci-prune.timer` that removes Docker images, containers and build cache older than two days.
#
# Settings (environment variables; the defaults are the values the runbook explains):
CI_USER="${CI_USER:-vereino-ci}"
REPO="${REPO:-wladku/Vereino}"
SLOTS="${SLOTS:-6}"
CPU_QUOTA="${CPU_QUOTA:-1200%}"
MEMORY_HIGH="${MEMORY_HIGH:-20G}"
MEMORY_MAX="${MEMORY_MAX:-24G}"
TASKS_MAX="${TASKS_MAX:-16384}"
TOKEN_FILE="${TOKEN_FILE:-/etc/vereino-ci/github-token}"
RUNNER_VERSION="${RUNNER_VERSION:-2.338.2}"
RUNNER_SHA256="${RUNNER_SHA256:-baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40}"
RUNNER_LABELS='["self-hosted","Linux","X64","vereino-ci"]'

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPT_DIR=/opt/vereino-ci
LIBEXEC_DIR=/usr/local/libexec/vereino-ci
RUN_DIR=/run/vereino-ci
UNIT_DIR=/etc/systemd/system

log() { printf '[ci-runner-setup] %s\n' "$*"; }
fail() { printf '[ci-runner-setup] ERROR: %s\n' "$*" >&2; exit 1; }

require_root() { [ "$(id -u)" -eq 0 ] || fail "run as root (sudo $0 $*)"; }

ci_uid() { id -u "$CI_USER"; }
ci_home() { getent passwd "$CI_USER" | cut -d: -f6; }

# Runs a command as $CI_USER inside its systemd user session (rootless Docker needs XDG_RUNTIME_DIR and the user bus).
as_ci() {
  local uid
  uid="$(ci_uid)"
  runuser -u "$CI_USER" -- env HOME="$(ci_home)" XDG_RUNTIME_DIR="/run/user/$uid" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" PATH="$(ci_home)/.local/node/bin:/usr/local/bin:/usr/bin:/bin" "$@"
}

check_host() {
  command -v systemctl >/dev/null || fail "systemd is required"
  [ -f /sys/fs/cgroup/cgroup.controllers ] || fail "cgroup v2 is required for the resource caps"
  [ "$(uname -m)" = x86_64 ] || fail "only x86_64 is supported (the runner and Node downloads are x64)"
  command -v dockerd-rootless-setuptool.sh >/dev/null \
    || fail "dockerd-rootless-setuptool.sh not found: install the package docker-ce-rootless-extras"
  [[ "$SLOTS" =~ ^[1-9][0-9]*$ ]] || fail "SLOTS must be a positive number"
}

install_packages() {
  log "installing the packages rootless Docker and the builds need"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    uidmap dbus-user-session slirp4netns curl jq git ca-certificates xz-utils build-essential python3 >/dev/null
}

create_user() {
  if ! id "$CI_USER" >/dev/null 2>&1; then
    log "creating the user $CI_USER"
    useradd --system --create-home --home-dir "/home/$CI_USER" --shell /usr/sbin/nologin "$CI_USER"
  fi
  local home
  home="$(ci_home)"
  chmod 0750 "$home"
  # The runner user must not reach the system Docker daemon or any other user's files through a group.
  local groups
  groups="$(id -nG "$CI_USER")"
  for group in $groups; do
    [ "$group" = "$CI_USER" ] || fail "$CI_USER is in the group $group; remove it (gpasswd -d $CI_USER $group)"
  done
  grep -q "^$CI_USER:" /etc/subuid || usermod --add-subuids 1000000-1065535 "$CI_USER"
  grep -q "^$CI_USER:" /etc/subgid || usermod --add-subgids 1000000-1065535 "$CI_USER"
  loginctl enable-linger "$CI_USER"
  for _ in $(seq 1 30); do [ -S "/run/user/$(ci_uid)/bus" ] && break; sleep 1; done
  [ -S "/run/user/$(ci_uid)/bus" ] || fail "the user session of $CI_USER did not start (is dbus-user-session installed?)"
}

# Ubuntu 23.10+ denies unprivileged user namespaces to unconfined programs. Rootless Docker (rootlesskit) and the
# Chromium sandbox of the browser tests need them, so they get a profile that allows them and nothing else changes.
install_apparmor() {
  local restrict=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
  if [ ! -r "$restrict" ] || [ "$(cat "$restrict")" != 1 ]; then return 0; fi
  log "allowing user namespaces for rootlesskit and $CI_USER's browsers (AppArmor)"
  cat > /etc/apparmor.d/vereino-ci-rootlesskit <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile vereino-ci-rootlesskit /usr/bin/rootlesskit flags=(unconfined) {
  userns,
  include if exists <local/vereino-ci-rootlesskit>
}
EOF
  cat > /etc/apparmor.d/vereino-ci-browsers <<EOF
abi <abi/4.0>,
include <tunables/global>

# Chromium builds that Playwright, agent-browser and Lighthouse use, installed under $CI_USER's home.
profile vereino-ci-browsers /home/$CI_USER/**/{chrome,chromium,chrome-headless-shell,headless_shell} flags=(unconfined) {
  userns,
  include if exists <local/vereino-ci-browsers>
}
EOF
  apparmor_parser -r /etc/apparmor.d/vereino-ci-rootlesskit /etc/apparmor.d/vereino-ci-browsers
}

install_rootless_docker() {
  local home
  home="$(ci_home)"
  if [ ! -f "$home/.config/systemd/user/docker.service" ]; then
    log "installing rootless Docker for $CI_USER"
    as_ci dockerd-rootless-setuptool.sh install >/dev/null
  fi
  as_ci systemctl --user enable --now docker.service
  as_ci env DOCKER_HOST="unix:///run/user/$(ci_uid)/docker.sock" docker info --format '{{.SecurityOptions}}' \
    | grep -q rootless || fail "the Docker daemon of $CI_USER is not rootless"
}

# Node from .nvmrc, checked against nodejs.org's SHASUMS256.txt: a root-owned copy for the root steps below and a copy
# the runner user owns, because `corepack enable` (the first CI step, before setup-node) writes into Node's bin dir.
install_node() {
  local major index tarball sum tmp
  major="$(tr -d 'v \n' < "$REPO_ROOT/.nvmrc")"
  index="https://nodejs.org/dist/latest-v${major}.x"
  tmp="$(mktemp -d)"
  curl -fsSL "$index/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  tarball="$(grep -oE "node-v[0-9.]+-linux-x64\.tar\.xz" "$tmp/SHASUMS256.txt" | head -n1)"
  [ -n "$tarball" ] || fail "no linux-x64 Node $major release in $index"
  if [ "$(cat "$OPT_DIR/node/.tarball" 2>/dev/null)" != "$tarball" ]; then
    log "installing $tarball"
    curl -fsSL "$index/$tarball" -o "$tmp/$tarball"
    sum="$(grep " $tarball\$" "$tmp/SHASUMS256.txt" | cut -d' ' -f1)"
    echo "$sum  $tmp/$tarball" | sha256sum --check --quiet
    rm -rf "$OPT_DIR/node"
    mkdir -p "$OPT_DIR/node"
    tar -xJf "$tmp/$tarball" -C "$OPT_DIR/node" --strip-components=1
    echo "$tarball" > "$OPT_DIR/node/.tarball"
  fi
  rm -rf "$tmp"
  local home
  home="$(ci_home)"
  if [ "$(cat "$home/.local/node/.tarball" 2>/dev/null)" != "$tarball" ]; then
    rm -rf "$home/.local/node"
    mkdir -p "$home/.local"
    cp -a "$OPT_DIR/node" "$home/.local/node"
    chown -R "$CI_USER:$CI_USER" "$home/.local"
  fi
  as_ci "$home/.local/node/bin/corepack" enable
}

# The system libraries of Playwright's Chromium (the hosted runner gets them from `--with-deps`, which needs sudo).
install_browser_libraries() {
  local version
  version="$(grep -oE '"@playwright/test": *"[^"]+"' "$REPO_ROOT/packages/app/package.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
  [ -n "$version" ] || fail "no @playwright/test version in packages/app/package.json"
  log "installing the system libraries of Playwright $version's Chromium"
  PATH="$OPT_DIR/node/bin:$PATH" npx --yes "playwright@$version" install-deps chromium >/dev/null
}

install_runner() {
  local release="$OPT_DIR/actions-runner-$RUNNER_VERSION"
  if [ ! -x "$release/run.sh" ]; then
    log "installing the GitHub Actions runner $RUNNER_VERSION"
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/runner.tar.gz" \
      "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz"
    echo "$RUNNER_SHA256  $tmp/runner.tar.gz" | sha256sum --check --quiet
    mkdir -p "$release"
    tar -xzf "$tmp/runner.tar.gz" -C "$release"
    rm -rf "$tmp"
  fi
  local home uid
  home="$(ci_home)"
  uid="$(ci_uid)"
  for slot in $(seq 1 "$SLOTS"); do
    local dir="$home/runners/$slot"
    if [ "$(cat "$dir/.vereino-runner-version" 2>/dev/null)" != "$RUNNER_VERSION" ]; then
      rm -rf "$dir"
      mkdir -p "$dir"
      cp -a "$release/." "$dir/"
      echo "$RUNNER_VERSION" > "$dir/.vereino-runner-version"
    fi
    # The job environment: rootless Docker for Testcontainers, the user's Node first on PATH.
    cat > "$dir/.env" <<EOF
DOCKER_HOST=unix:///run/user/$uid/docker.sock
XDG_RUNTIME_DIR=/run/user/$uid
EOF
    echo "$home/.local/node/bin:/usr/local/bin:/usr/bin:/bin" > "$dir/.path"
    chown -R "$CI_USER:$CI_USER" "$home/runners"
  done
}

install_helpers() {
  mkdir -p "$LIBEXEC_DIR" "$(dirname "$TOKEN_FILE")"
  chmod 0700 "$(dirname "$TOKEN_FILE")"
  # Runs as root before each slot starts: one JIT runner configuration from GitHub, readable by the runner user only.
  cat > "$LIBEXEC_DIR/jit-config" <<EOF
#!/usr/bin/env bash
set -euo pipefail
slot="\$1"
[ -s "$TOKEN_FILE" ] || { echo "no GitHub token in $TOKEN_FILE (docs/ops/ci-runners.md)" >&2; exit 1; }
umask 077
install -d -m 0700 -o "$CI_USER" -g "$CI_USER" "$RUN_DIR"
headers="\$(mktemp)"
trap 'rm -f "\$headers"' EXIT
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\nX-GitHub-Api-Version: 2022-11-28\n' \\
  "\$(tr -d ' \n' < "$TOKEN_FILE")" > "\$headers"
body="\$(jq -n --arg name "\$(hostname -s)-\$slot-\$(date +%s)" --argjson labels '$RUNNER_LABELS' \\
  '{name: \$name, runner_group_id: 1, labels: \$labels, work_folder: "_work"}')"
curl -fsS -X POST -H @"\$headers" -d "\$body" \\
  "https://api.github.com/repos/$REPO/actions/runners/generate-jitconfig" \\
  | jq -er .encoded_jit_config > "$RUN_DIR/slot-\$slot.jit"
chown "$CI_USER:$CI_USER" "$RUN_DIR/slot-\$slot.jit"
EOF
  # Runs as the runner user: takes the configuration (single use), deletes it, runs one job.
  cat > "$LIBEXEC_DIR/run-slot" <<EOF
#!/usr/bin/env bash
set -euo pipefail
file="$RUN_DIR/slot-\$1.jit"
config="\$(cat "\$file")"
rm -f "\$file"
exec ./run.sh --jitconfig "\$config"
EOF
  chmod 0755 "$LIBEXEC_DIR/jit-config" "$LIBEXEC_DIR/run-slot"
}

install_units() {
  local uid home
  uid="$(ci_uid)"
  home="$(ci_home)"
  log "writing the systemd units ($SLOTS slots, CPUQuota=$CPU_QUOTA, MemoryMax=$MEMORY_MAX)"
  # The slots run in the user's slice, next to its rootless Docker and the containers the jobs start, so one cap
  # covers everything a CI job uses.
  mkdir -p "$UNIT_DIR/user-$uid.slice.d"
  cat > "$UNIT_DIR/user-$uid.slice.d/50-vereino-ci.conf" <<EOF
# Written by scripts/ci-runner-setup.sh (#834): every CI job and its containers share these caps.
[Slice]
CPUQuota=$CPU_QUOTA
MemoryHigh=$MEMORY_HIGH
MemoryMax=$MEMORY_MAX
TasksMax=$TASKS_MAX
EOF
  cat > "$UNIT_DIR/vereino-ci-runner@.service" <<EOF
# Written by scripts/ci-runner-setup.sh (#834). One ephemeral GitHub Actions runner: one job, then a fresh registration.
[Unit]
Description=Vereino CI runner slot %i (ephemeral, one job per registration)
Wants=network-online.target user@$uid.service
After=network-online.target user@$uid.service
StartLimitIntervalSec=600
StartLimitBurst=10

[Service]
Type=simple
User=$CI_USER
Group=$CI_USER
Slice=user-$uid.slice
WorkingDirectory=$home/runners/%i
Environment=HOME=$home
Environment=XDG_RUNTIME_DIR=/run/user/$uid
Environment=DOCKER_HOST=unix:///run/user/$uid/docker.sock
ExecStartPre=+$LIBEXEC_DIR/jit-config %i
ExecStart=$LIBEXEC_DIR/run-slot %i
Restart=always
RestartSec=10
TimeoutStopSec=120
# The job sees its own home only: the other homes (the owner's, the sandboxes, the Cezar state) are hidden.
ProtectHome=tmpfs
BindPaths=$home
PrivateTmp=yes
ProtectSystem=full
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes

[Install]
WantedBy=multi-user.target
EOF
  cat > "$UNIT_DIR/vereino-ci-prune.service" <<EOF
# Written by scripts/ci-runner-setup.sh (#834).
[Unit]
Description=Remove Docker data of the Vereino CI runners older than two days

[Service]
Type=oneshot
User=$CI_USER
Slice=user-$uid.slice
Environment=XDG_RUNTIME_DIR=/run/user/$uid
Environment=DOCKER_HOST=unix:///run/user/$uid/docker.sock
ExecStart=/usr/bin/docker system prune --all --force --filter until=48h
EOF
  cat > "$UNIT_DIR/vereino-ci-prune.timer" <<EOF
# Written by scripts/ci-runner-setup.sh (#834).
[Unit]
Description=Daily clean-up of the Vereino CI runners' Docker data

[Timer]
OnCalendar=*-*-* 04:30
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now vereino-ci-prune.timer >/dev/null
}

# Rootless Docker runs outside the slots' namespaces, so a job could mount any path its user can read into a
# container. Every other home must therefore be closed to "others".
audit_homes() {
  local open=0
  while IFS=: read -r name _ uid _ _ home _; do
    [ "$uid" -ge 1000 ] || continue
    [ "$name" != "$CI_USER" ] && [ "$name" != nobody ] && [ -d "$home" ] || continue
    if [ $(( 0$(stat -c '%a' "$home") & 07 )) -ne 0 ]; then
      log "WARNING: $home is open to other users ($(stat -c '%a' "$home")); run: chmod o-rwx $home"
      open=1
    fi
  done < /etc/passwd
  [ "$open" -eq 0 ] && log "home directories: none open to other users"
  return 0
}

cmd_install() {
  check_host
  install_packages
  create_user
  install_apparmor
  install_rootless_docker
  install_node
  install_browser_libraries
  install_runner
  install_helpers
  install_units
  audit_homes
  if [ -s "$TOKEN_FILE" ]; then
    log "installed; start the slots with: sudo $0 start"
  else
    log "installed; put the GitHub token in $TOKEN_FILE (root, 0600), then: sudo $0 start (docs/ops/ci-runners.md)"
  fi
}

cmd_start() {
  [ -s "$TOKEN_FILE" ] || fail "no GitHub token in $TOKEN_FILE (docs/ops/ci-runners.md)"
  [ "$(stat -c '%U %a' "$TOKEN_FILE")" = "root 600" ] || fail "$TOKEN_FILE must be owned by root with mode 0600"
  for slot in $(seq 1 "$SLOTS"); do systemctl enable --now "vereino-ci-runner@$slot.service" >/dev/null; done
  log "started $SLOTS slot(s); they appear in GitHub under Settings > Actions > Runners while they wait for a job"
}

cmd_stop() {
  local units
  units="$(systemctl list-units --all --plain --no-legend 'vereino-ci-runner@*.service' | awk '{print $1}')"
  for unit in $units; do systemctl disable --now "$unit" >/dev/null; done
  rm -f "$RUN_DIR"/slot-*.jit
  log "stopped every slot; unset the repository variable CI_SELF_HOSTED so no job waits for them"
}

cmd_status() {
  systemctl list-units --all --plain --no-legend 'vereino-ci-runner@*.service' || true
  if id "$CI_USER" >/dev/null 2>&1; then
    systemctl show "user-$(ci_uid).slice" -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax -p MemoryCurrent -p TasksMax
    as_ci env DOCKER_HOST="unix:///run/user/$(ci_uid)/docker.sock" docker info --format 'rootless docker: {{.SecurityOptions}}' || true
  fi
  audit_homes
}

main() {
  local command="${1:-}"
  case "$command" in
    install) require_root "$@"; cmd_install ;;
    start) require_root "$@"; cmd_start ;;
    stop) require_root "$@"; cmd_stop ;;
    status) require_root "$@"; cmd_status ;;
    *) sed -n '2,8p' "$0"; exit 2 ;;
  esac
}

main "$@"
