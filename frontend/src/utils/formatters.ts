export const fmtGWh = (v: number) => `${v.toFixed(1)} GWh`
export const fmtMW = (v: number) => `${v.toFixed(0)} MW`
export const fmtPct = (v: number) => `${v.toFixed(1)}%`
export const fmtIRR = (v: number) => `${(v * 100).toFixed(1)}%`
export const fmtMUSD = (v: number) => `$${v.toFixed(1)}M`
export const fmtUSD_MWh = (v: number) => `$${v.toFixed(1)}/MWh`
export const fmtKm = (v: number) => `${v.toFixed(1)} km`
export const fmtKm2 = (v: number) => `${v.toFixed(1)} km²`
export const fmtDSCR = (v: number) => v.toFixed(2) + 'x'
