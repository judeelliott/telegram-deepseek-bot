#!/usr/bin/env bash

set -euo pipefail

REPO_URL="https://github.com/judeelliott/telegram-deepseek-bot.git"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository."
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
CURRENT_DIR="$(pwd -P)"

if [ "${CURRENT_DIR}" != "${ROOT_DIR}" ]; then
  echo "Error: run this script from repository root: ${ROOT_DIR}"
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "${REPO_URL}"
  echo "origin set to ${REPO_URL}"
fi

git add .

if git diff --cached --quiet; then
  echo "No changes to commit. Exit without error."
  exit 0
fi

git commit -m "update"
git push origin main

