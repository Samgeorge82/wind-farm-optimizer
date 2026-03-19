"""
Offshore Wind Farm Development Platform — FastAPI Backend
"""
import sys
from pathlib import Path

# Add backend directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import turbines, aep, electrical, foundation, marine, financial, sensitivity, wind

app = FastAPI(
    title="Offshore Wind Farm Development Platform",
    description=(
        "Full-stack tool for offshore wind project development: "
        "layout optimization, wake modeling, AEP, electrical infrastructure, "
        "foundation design, financial modeling (IRR, LCOE, NPV), and risk analysis."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(turbines.router,     prefix="/api/turbines",     tags=["Turbines"])
app.include_router(aep.router,          prefix="/api/layout",       tags=["Layout & AEP"])
app.include_router(electrical.router,   prefix="/api/electrical",   tags=["Electrical"])
app.include_router(foundation.router,   prefix="/api/foundation",   tags=["Foundation"])
app.include_router(marine.router,       prefix="/api/marine",       tags=["Marine"])
app.include_router(financial.router,    prefix="/api/financial",    tags=["Financial"])
app.include_router(sensitivity.router,  prefix="/api/sensitivity",  tags=["Sensitivity"])
app.include_router(wind.router,         prefix="/api/wind",          tags=["Wind Resource"])


@app.get("/")
def root():
    return {
        "name": "Offshore Wind Farm Development Platform",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "operational",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
