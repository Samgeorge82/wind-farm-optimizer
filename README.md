# Offshore Wind Farm Development Platform

A comprehensive wind farm layout optimization and financial analysis tool — everything a wind energy company needs in one platform.

## Features

### Engineering
- **Layout Optimization** — Staggered grid + gradient-based (COBYLA) + differential evolution
- **Wake Modeling** — Jensen (Park) & Bastankhah Gaussian models
- **AEP Calculation** — Weibull × power curve × wake integration, 12-sector wind rose
- **Electrical BOS** — Array cable string builder, cable sizing (I²R), OSS position optimizer, HVAC/HVDC export selection
- **Foundation Design** — Monopile / Jacket / Floating selection + empirical cost regression
- **Marine & Metocean** — Weather window analysis, vertical wind shear extrapolation

### Financial
- **Full DCF Model** — IRR (project & equity), LCOE, NPV, DSCR timeline
- **Bottom-up CAPEX** — Turbine supply/install, foundation, array cables, OSS, export cable, onshore SS, vessels
- **OPEX** — Fixed, variable, insurance, lease, asset management
- **Debt structuring** — Annuity loan with grace period, interest tax shield

### Risk & Sensitivity
- **Tornado Analysis** — One-at-a-time ±10% sensitivity on Project IRR
- **Monte Carlo** — LogNormal AEP, Normal CAPEX/OPEX/price; 500–5000 iterations async
- **Scenario comparison** — Base / Optimistic / Conservative

### Reporting
- **GeoJSON export** — Turbine positions, boundary, cable routing (works offline)
- **PDF report** — Executive summary (requires server endpoint)
- **Excel export** — Cash flows, cable schedule (requires server endpoint)

## Quick Start

### Windows
Double-click `start.bat` — it will start both servers and open the browser.

### Manual
```bash
# Terminal 1: Backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.
API docs: **http://localhost:8000/docs**

## Workflow

1. **Site** — Enter project name, draw boundary polygon on map
2. **Wind** — Enter Weibull parameters for each sector (12-sector wind rose)
3. **Turbines** — Select turbine from library (V236-15MW, SG14, Haliade-X, V150)
4. **Layout** — Set n_turbines, spacing, run staggered or optimization
5. **AEP** — Calculate net AEP with Jensen or Gaussian wake model
6. **Electrical** — Build array cable network, size cables, optimize OSS position, select export cable
7. **Foundation** — Auto-select monopile/jacket/floating by water depth, get cost estimates
8. **Marine** — Analyze weather windows, vertical wind shear extrapolation
9. **Financial** — Full DCF model (IRR, LCOE, NPV, DSCR) with auto-populated CAPEX
10. **Risk** — Tornado chart + Monte Carlo probabilistic analysis
11. **Reports** — Export GeoJSON layout, PDF report, Excel cash flows

## Architecture

```
wind-farm-optimizer/
├── backend/               # FastAPI (Python)
│   ├── main.py            # App + CORS + all routers
│   ├── models/            # Pydantic models
│   ├── services/          # Physics + financial engines
│   │   ├── wake/          # Jensen, Gaussian wake models
│   │   ├── aep/           # AEP calculator
│   │   ├── layout/        # Boundary, optimizer
│   │   ├── electrical/    # Cable sizing, OSS, export
│   │   ├── foundation/    # Cost model
│   │   ├── marine/        # Weather windows, wind shear
│   │   ├── financial/     # DCF model
│   │   └── sensitivity/   # Tornado, Monte Carlo
│   ├── routers/           # API endpoints
│   ├── workers/           # Async job store
│   └── data/              # Turbine specs, cable specs
└── frontend/              # React + TypeScript + Vite
    └── src/
        ├── App.tsx         # Main layout
        ├── api/            # Axios API client
        ├── store/          # Zustand stores
        ├── types/          # TypeScript interfaces
        ├── utils/          # Geo transforms, formatters
        ├── hooks/          # useJobPolling
        └── components/
            ├── Sidebar.tsx
            ├── MapToolbar.tsx
            ├── map/        # Leaflet map
            ├── charts/     # Wind rose, power curve
            └── panels/     # 11 feature panels
```

## Tech Stack

**Backend:** FastAPI, Pydantic v2, NumPy, SciPy, Shapely
**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Recharts, Leaflet

## Turbine Library

| Turbine | Rating | Rotor | Hub Height |
|---------|--------|-------|------------|
| Vestas V236-15.0 MW | 15 MW | 236 m | 150 m |
| Siemens Gamesa SG 14-236 DD | 14 MW | 236 m | 150 m |
| GE Haliade-X 14 MW | 14 MW | 220 m | 150 m |
| Vestas V150-4.2 MW | 4.2 MW | 150 m | 105 m |
