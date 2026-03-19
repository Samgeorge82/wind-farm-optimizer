import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FinancialResult } from '../types'

export interface FinancialInputs {
  turbineSupplyUsdMw: number
  turbineInstallUsdMw: number
  installationVesselsMusd: number
  ossUsdMusd: number
  exportCableLengthKm: number
  distanceToShoreKm: number
  wacc: number
  debtFraction: number
  interestRate: number
  loanTenorYears: number
  energyPriceUsdMwh: number
  escalationRate: number
  fixedOpexUsdMwYear: number
  variableOpexUsdMwh: number
  projectLifetime: number
  taxRate: number
}

const DEFAULT_INPUTS: FinancialInputs = {
  turbineSupplyUsdMw: 1_400_000,
  turbineInstallUsdMw: 250_000,
  installationVesselsMusd: 50,
  ossUsdMusd: 100,
  exportCableLengthKm: 50,
  distanceToShoreKm: 50,
  wacc: 0.07,
  debtFraction: 0.70,
  interestRate: 0.045,
  loanTenorYears: 18,
  energyPriceUsdMwh: 85,
  escalationRate: 0.02,
  fixedOpexUsdMwYear: 60_000,
  variableOpexUsdMwh: 3.0,
  projectLifetime: 25,
  taxRate: 0.25,
}

interface FinancialState {
  inputs: FinancialInputs
  result: FinancialResult | null
  isCalculating: boolean
  setInputs: (inputs: Partial<FinancialInputs>) => void
  setResult: (r: FinancialResult | null) => void
  setCalculating: (v: boolean) => void
}

export const useFinancialStore = create<FinancialState>()(
  immer((set) => ({
    inputs: DEFAULT_INPUTS,
    result: null,
    isCalculating: false,
    setInputs: (inputs) => set((s) => { Object.assign(s.inputs, inputs) }),
    setResult: (r) => set((s) => { s.result = r }),
    setCalculating: (v) => set((s) => { s.isCalculating = v }),
  }))
)
