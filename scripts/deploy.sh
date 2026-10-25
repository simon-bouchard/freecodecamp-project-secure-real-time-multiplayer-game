#!/usr/bin/env bash
# shellcheck disable=SC2029  # remote commands intentionally expand local settings
# Build and test locally, copy the build to the server, install production deps, restart the
# systemd service. Settings come from deploy.env (see deploy.env.example).
set -euo pipefail

skip_checks=false
for arg in "$@"; do
	case "$arg" in
	--skip-checks) skip_checks=true ;;
	*)
		echo "Usage: $0 [--skip-checks]" >&2
		exit 1
		;;
	esac
done

cd "$(dirname "$0")/.."

if [[ ! -f deploy.env ]]; then
	echo "Missing deploy.env: copy deploy.env.example and fill it in." >&2
	exit 1
fi
# shellcheck source=/dev/null
source deploy.env
: "${DEPLOY_HOST:?set DEPLOY_HOST in deploy.env}"
: "${DEPLOY_DIR:?set DEPLOY_DIR in deploy.env}"
: "${DEPLOY_SERVICE:?set DEPLOY_SERVICE in deploy.env}"
DEPLOY_URL="${DEPLOY_URL:-}"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != main ]]; then
	echo "Warning: deploying branch '$branch', not main."
fi
if [[ -n "$(git status --porcelain)" ]]; then
	echo "Warning: uncommitted changes will be deployed."
fi

if [[ "$skip_checks" == false ]]; then
	echo "==> Tests and typecheck"
	npm test
	npm run typecheck
fi

echo "==> Build"
npm run build

echo "==> Copy to $DEPLOY_HOST:$DEPLOY_DIR"
ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR'"
# Keep the server's own owner and group; our SSH user may not be allowed to change them.
RSYNC=(rsync -az --no-owner --no-group)
"${RSYNC[@]}" --delete dist/ "$DEPLOY_HOST:$DEPLOY_DIR/dist/"
"${RSYNC[@]}" package.json package-lock.json "$DEPLOY_HOST:$DEPLOY_DIR/"

echo "==> Install production dependencies and restart $DEPLOY_SERVICE"
ssh -t "$DEPLOY_HOST" "cd '$DEPLOY_DIR' && npm ci --omit=dev --no-audit --no-fund \
	&& sudo systemctl restart '$DEPLOY_SERVICE' && sleep 2 \
	&& systemctl is-active '$DEPLOY_SERVICE'"

if [[ -n "$DEPLOY_URL" ]]; then
	echo "==> Check $DEPLOY_URL"
	curl -fsS -o /dev/null -w "HTTP %{http_code}\n" "$DEPLOY_URL"
fi

echo "Deployed $(git rev-parse --short HEAD) to $DEPLOY_HOST."
