from fastapi import FastAPI

from app.routers import auth, habits, logs

app = FastAPI(title="Daily Habit Tracker API", version="0.1.0")

app.include_router(auth.router)
app.include_router(habits.router)
app.include_router(logs.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
