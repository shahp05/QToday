# QToday

FastAPI backend + Vite/React frontend for CBSE EdTech (Grades 1–12).

## Starting the servers

Open two terminals from the project root:

**Backend** (http://localhost:8000)
```powershell
.\start_backend.ps1
```
Or manually:
```powershell
cd backend
.\myenv\Scripts\uvicorn.exe main:app --reload --port 8000
```

**Frontend** (http://localhost:5173)
```powershell
.\start_frontend.ps1
```
Or manually:
```powershell
cd frontend
npm run dev
```

## Notes

- The FastAPI app entry point is `main:app` (not `app.main:app`) — `main.py` is at `backend/main.py`.
- Always use `myenv` (not `venv`) — dependencies are installed there.
- If uvicorn is missing after recreating the venv, run: `.\myenv\Scripts\pip.exe install -r requirements.txt` from the `backend/` folder.
