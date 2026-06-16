Set-Location "$PSScriptRoot\backend"
& ".\myenv\Scripts\uvicorn.exe" main:app --reload --port 8000
