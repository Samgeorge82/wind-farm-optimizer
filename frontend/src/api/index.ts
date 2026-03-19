import { get, post, del } from './client'
import type {
  TurbineSpec, AEPResult, ElectricalNetwork,
  FoundationSummary, FinancialResult, TornadoResult,
  WindRose, Job
} from '../types'

// Turbines
export const getTurbines = () => get<TurbineSpec[]>('/turbines/')

// Layout / AEP
export const evaluateLayout = (body: any) => post<AEPResult>('/layout/evaluate', body)
export const startOptimization = (body: any) => post<{ job_id: string; status: string }>('/layout/optimize', body)
export const getJob = (jobId: string) => get<Job>(`/layout/jobs/${jobId}`)
export const cancelJob = (jobId: string) => del<void>(`/layout/jobs/${jobId}`)

// Electrical
export const buildElectrical = (body: any) => post<ElectricalNetwork>('/electrical/build', body)

// Foundation
export const assessFoundation = (body: any) => post<FoundationSummary>('/foundation/assess', body)

// Marine
export const assessMarine = (body: any) => post<any>('/marine/assess', body)

// Financial
export const calculateFinancial = (body: any) => post<FinancialResult>('/financial/calculate', body)
export const compareScenarios = (body: any) => post<any>('/financial/scenarios', body)

// Sensitivity
export const runTornado = (body: any) => post<TornadoResult>('/sensitivity/tornado', body)
export const startMonteCarlo = (body: any) => post<any>('/sensitivity/montecarlo', body)
export const getMCJob = (jobId: string) => get<Job>(`/sensitivity/montecarlo/${jobId}`)

// Wind Resource
export interface WindFetchResponse {
  wind_rose: WindRose
  mean_speed_ms: number
  data_years: number
  data_source: string
  location: { lat: number; lng: number }
}
export const fetchWindData = (body: { lat: number; lng: number; n_sectors?: number; years?: number }) =>
  post<WindFetchResponse>('/wind/fetch', body)

// Wake Field Visualization
export interface WakeFieldResult {
  grid: number[][]
  bounds: { min_lat: number; min_lng: number; max_lat: number; max_lng: number }
  rows: number
  cols: number
  wind_direction_deg: number
  wind_speed_ms: number
  grid_resolution_m: number
}
export const computeWakeField = (body: any) => post<WakeFieldResult>('/layout/wake-field', body)
