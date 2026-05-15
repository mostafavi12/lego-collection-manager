"""FastAPI application entrypoint."""

from dotenv import load_dotenv
from fastapi import FastAPI

from app.api.routes import imports

load_dotenv()

app = FastAPI(
    title="LEGO Collection Manager API",
    version="0.1.0",
)

app.include_router(imports.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
