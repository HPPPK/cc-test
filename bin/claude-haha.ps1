#!/usr/bin/env pwsh
# claude-haha Windows 启动脚本

$ErrorActionPreference = "Stop"
$ROOT_DIR = Split-Path -Parent $PSScriptRoot

# 设置调用目录环境变量
if (-not $env:CALLER_DIR) {
    $env:CALLER_DIR = Get-Location
}

Push-Location $ROOT_DIR

# 环境文件处理
$EnvFileFlag = ""
if ($env:CC_HAHA_SKIP_DOTENV -eq "1") {
    $EnvFileFlag = "--env-file=/dev/null"
} elseif (Test-Path ".env") {
    $EnvFileFlag = "--env-file=.env"
}

# 强制恢复 CLI 模式
if ($env:CLAUDE_CODE_FORCE_RECOVERY_CLI -eq "1") {
    bun $EnvFileFlag ./src/localRecoveryCli.ts @args
} else {
    # 默认: 完整 CLI (Ink TUI)
    bun $EnvFileFlag ./src/entrypoints/cli.tsx @args
}

Pop-Location
