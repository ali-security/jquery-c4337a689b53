#!/usr/bin/env bash
# Runs the QUnit browser suite (test/index.html) in headless Chrome on Travis.
# Expects dist/jquery.js to be built already (npm test). Serves the repo root
# with PHP's built-in server (the ajax tests need test/data/*.php) and drives
# Chrome with .github/ci/qunit-runner.js on a modern Node via nvm; the build itself
# stays on the Node 0.10 that Travis activated.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER_DIR=/tmp/qunit-runner
PORT=8000

cd "$ROOT"

# Several workers: the built-in server is otherwise single-threaded, and
# test/data/core/dont_return.php (sleep 30) would stall every other request.
PHP_CLI_SERVER_WORKERS=8 php -S 127.0.0.1:$PORT -t . > /tmp/php-server.log 2>&1 &
PHP_PID=$!
trap 'kill "$PHP_PID" 2>/dev/null' EXIT

for i in $(seq 1 30); do
	if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/test/index.html"; then
		break
	fi
	if [ "$i" -eq 30 ]; then
		echo "PHP server did not come up" >&2
		cat /tmp/php-server.log >&2
		exit 1
	fi
	sleep 1
done

# nvm.sh is not errexit/nounset-clean; the node version check below is the gate
set +eu
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
set -eu
node -e 'process.exit(parseInt(process.versions.node, 10) >= 20 ? 0 : 1)'
node --version

# The global registry points at the 2014 time machine; the runner needs current packages
mkdir -p "$RUNNER_DIR"
npm install --prefix "$RUNNER_DIR" --no-save --no-package-lock --no-audit --no-fund \
	--registry=https://registry.npmjs.org/ puppeteer-core@24

CHROME_BIN="$(which google-chrome-stable)" \
NODE_PATH="$RUNNER_DIR/node_modules" \
	node .github/ci/qunit-runner.js "http://127.0.0.1:$PORT/test/index.html"
