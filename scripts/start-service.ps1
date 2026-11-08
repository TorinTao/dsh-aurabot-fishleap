# 启动 lexmount-patrol 服务（后台隐藏窗口；日志写到 data/server.log）
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root 'data\server.log'
$err = Join-Path $root 'data\server.err.log'
New-Item -ItemType Directory -Force -Path (Join-Path $root 'data') | Out-Null
$p = Start-Process -FilePath 'node' -ArgumentList @((Join-Path $root 'src\cli.mjs'), 'serve') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
Write-Output ("lexmount-patrol 已启动 pid=" + $p.Id + " 面板: http://127.0.0.1:4571/  日志: " + $log)
