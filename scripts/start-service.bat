@echo off
cd /d "%~dp0.."
if not exist "data" mkdir "data"
node src\cli.mjs serve >> data\server.log 2>> data\server.err.log
