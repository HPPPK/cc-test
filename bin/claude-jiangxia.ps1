#!/usr/bin/env pwsh
# claude-jiangxia Windows startup script

$ErrorActionPreference = "Stop"
$ROOT_DIR = Split-Path -Parent $PSScriptRoot

if (-not $env:CALLER_DIR) {
    $env:CALLER_DIR = Get-Location
}

Push-Location $ROOT_DIR

$EnvFileFlag = ""
if ($env:CC_JIANGXIA_SKIP_DOTENV -eq "1" -or $env:CC_HAHA_SKIP_DOTENV -eq "1") {
    $EnvFileFlag = "--env-file=/dev/null"
} elseif (Test-Path ".env") {
    $EnvFileFlag = "--env-file=.env"
}

if ($env:CLAUDE_CODE_FORCE_RECOVERY_CLI -eq "1") {
    bun $EnvFileFlag ./src/localRecoveryCli.ts @args
} else {
    bun $EnvFileFlag ./src/entrypoints/cli.tsx @args
}

Pop-Location
