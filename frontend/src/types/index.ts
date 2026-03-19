// ── Shared geo types ──────────────────────────────────────────────────────────
export interface GeoPoint { lat: number; lng: number }
export interface BoundaryPolygon { coordinates: GeoPoint[] }
export interface ExclusionZone { center: GeoPoint; radius_m: number; label?: string }

// ── Turbine ───────────────────────────────────────────────────────────────────
export interface PowerCurvePoint { wind_speed: number; power: number }
export interface TurbineSpec {
  id: string; name: string; manufacturer: string
  rated_power_kw: number; rotor_diameter_m: number; hub_height_m: number
  iec_class: string; cut_in_speed: number; cut_out_speed: number; rated_speed: number
  power_curve: PowerCurvePoint[]; ct_curve: PowerCurvePoint[]
}

// ── Wind Rose ─────────────────────────────────────────────────────────────────
export interface WeibullSector { k: number; A: number; frequency: number }
export interface WindRose {
  n_sectors: number; sectors: WeibullSector[]
  reference_height_m: number; roughness_length_m: number
}

// ── Layout ────────────────────────────────────────────────────────────────────
export interface TurbinePosition {
  id: string; lat: number; lng: number; x: number; y: number
  aep_gwh?: number; wake_loss?: number
}

export interface AEPResult {
  aep_gwh: number; gross_aep_gwh: number; wake_loss_pct: number
  capacity_factor: number; per_turbine_aep: number[]
  per_turbine_wake_loss: number[]; energy_by_direction?: number[]
}

// ── Electrical ────────────────────────────────────────────────────────────────
export interface CableSpec {
  cross_section_mm2: number; voltage_kv: number
  current_rating_amps: number; resistance_ohm_km: number; cost_usd_km: number
}
export interface CableSegment {
  segment_id: string; from_id: string; to_id: string
  length_m: number; cable_spec: CableSpec
  current_amps: number; losses_kw: number; cost_usd: number
  route_coords: [number, number][]
}
export interface StringConfig {
  string_id: string; turbine_ids: string[]; segments: CableSegment[]
  total_length_m: number; total_losses_kw: number
  total_cost_usd: number; peak_current_amps: number
}
export interface OSSConfig {
  oss_id: string; lat: number; lng: number; x: number; y: number
  transformer_mva: number; num_transformers: number
  voltage_hv_kv: number; voltage_lv_kv: number
  platform_cost_musd: number; transformer_cost_musd: number; total_cost_musd: number
}
export interface ExportCableConfig {
  cable_type: string; length_km: number; cost_usd_km: number; total_cost_musd: number
  reactive_compensation_musd?: number; converter_station_musd?: number
  losses_mw: number; selection_reason: string
}
export interface ElectricalNetwork {
  strings: StringConfig[]; oss: OSSConfig; export_cable: ExportCableConfig
  array_voltage_kv: number; total_array_losses_pct: number
  total_cable_cost_musd: number; total_electrical_losses_mw: number
  array_cable_total_km: number
}

// ── Foundation ────────────────────────────────────────────────────────────────
export interface TurbineFoundationResult {
  turbine_id: string; water_depth_m: number; seabed_type: string
  foundation_type: string; steel_mass_tonnes: number
  supply_cost_musd: number; installation_cost_musd: number
  total_cost_musd: number; design_notes: string[]
}
export interface FoundationSummary {
  per_turbine: TurbineFoundationResult[]
  type_distribution: Record<string, number>
  total_cost_musd: number; average_cost_musd_per_turbine: number
  cost_by_type: Record<string, number>
}

// ── Financial ─────────────────────────────────────────────────────────────────
export interface AnnualCashFlow {
  year: number; revenue_musd: number; opex_musd: number; ebitda_musd: number
  depreciation_musd: number; ebit_musd: number; interest_musd: number
  ebt_musd: number; tax_musd: number; net_income_musd: number
  debt_repayment_musd: number; capex_musd: number
  fcfe_musd: number; fcff_musd: number
  debt_outstanding_musd: number; dscr?: number
}
export interface FinancialResult {
  project_irr: number; equity_irr: number; npv_musd: number
  lcoe_usd_mwh: number; payback_year: number
  min_dscr: number; average_dscr: number; total_capex_musd: number
  annual_cash_flows: AnnualCashFlow[]
  capex_breakdown_musd: Record<string, number>
  lcoe_components: Record<string, number>; warnings: string[]
}

// ── Sensitivity ───────────────────────────────────────────────────────────────
export interface TornadoBar {
  variable: string; display_label: string; base_value: number
  low_impact: number; high_impact: number; swing: number
}
export interface TornadoResult {
  target_metric: string; base_result: number; bars: TornadoBar[]
}
export interface MonteCarloStats {
  p10: number; p25: number; p50: number; p75: number; p90: number; mean: number
}
export interface MonteCarloResult {
  n_iterations: number
  equity_irr: MonteCarloStats; project_irr: MonteCarloStats
  lcoe_usd_mwh: MonteCarloStats; npv_musd: MonteCarloStats
  irr_histogram: number[]; lcoe_histogram: number[]
}

// ── Marine ────────────────────────────────────────────────────────────────────
export interface WeatherWindowResult {
  annual_operational_pct: number
  annual_cable_lay_pct: number
  annual_monopile_install_pct: number
  annual_operational_hours: number
  annual_cable_lay_hours: number
  installation_vessel_days_required: number
  notes: string[]
}
export interface VerticalExtrapolationResult {
  hub_height_wind_speed_ms: number
  shear_multiplier: number
  method_used: string
}
export interface MarineAssessmentResult {
  air_density_kg_m3: number
  density_correction_factor: number
  turbulence_class: string
  reference_turbulence_intensity: number
  weather_window: WeatherWindowResult
  vertical_extrapolation?: VerticalExtrapolationResult
}

// ── Job ───────────────────────────────────────────────────────────────────────
export interface Job {
  job_id: string; status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number; message: string; result?: any; error?: string
}
