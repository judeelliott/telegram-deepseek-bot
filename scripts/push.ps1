$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/judeelliott/telegram-deepseek-bot.git"

git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Error: not inside a git repository."
}

$rootDir = (git rev-parse --show-toplevel).Trim()
$currentDir = (Get-Location).Path

if ($currentDir -ne $rootDir) {
  Write-Error "Error: run this script from repository root: $rootDir"
}

git remote get-url origin *> $null
if ($LASTEXITCODE -ne 0) {
  git remote add origin $repoUrl
  Write-Host "origin set to $repoUrl"
}

git add .

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "No changes to commit. Exit without error."
  exit 0
}

git commit -m "update"
git push origin main

