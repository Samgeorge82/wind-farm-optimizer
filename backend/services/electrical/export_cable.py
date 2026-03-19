from __future__ import annotations
import json
from pathlib import Path
from models.electrical import ExportCableConfig, ExportCableType

_DATA_PATH = Path(__file__).parent.parent.parent / "data" / "cable_specs.json"


def select_export_cable(
    distance_km: float,
    installed_mw: float,
    wacc: float = 0.07,
    project_lifetime: int = 25,
) -> ExportCableConfig:
    """
    Select HVAC or HVDC based on distance and capacity rules.

    Rules:
      ≤ 60km  → HVAC 132kV
      60-100  → HVAC 220kV
      100-200 → ΔNPV analysis
      > 200   → HVDC 320kV
    """
    with open(_DATA_PATH) as f:
        specs = json.load(f)["export_cables"]

    if distance_km <= 60.0 and installed_mw <= 400:
        key = "HVAC_132kV"
        reason = f"Distance {distance_km:.0f}km ≤ 60km → HVAC 132kV"
    elif distance_km <= 100.0 and installed_mw <= 800:
        key = "HVAC_220kV"
        reason = f"Distance {distance_km:.0f}km in 60-100km range → HVAC 220kV"
    elif distance_km <= 200.0:
        # ΔNPV comparison
        hvac_losses_pct = specs["HVAC_220kV"]["losses_pct_per_100km"] * distance_km / 100
        hvdc_losses_pct = specs["HVDC_320kV"]["losses_pct_per_100km"] * distance_km / 100
        annual_mwh = installed_mw * 8760 * 0.40  # ~40% capacity factor
        price_usd_mwh = 85.0
        annual_loss_saving = (hvac_losses_pct - hvdc_losses_pct) / 100 * annual_mwh * price_usd_mwh
        # PV of loss savings
        annuity = (1 - (1 + wacc) ** -project_lifetime) / wacc
        pv_saving = annual_loss_saving * annuity / 1e6  # MUSD
        # HVDC premium
        hvdc_premium = (
            (specs["HVDC_320kV"]["cost_usd_km"] - specs["HVAC_220kV"]["cost_usd_km"])
            * distance_km / 1e6
            + specs["HVDC_320kV"]["converter_station_musd"]
        )
        if pv_saving > hvdc_premium:
            key = "HVDC_320kV"
            reason = f"ΔNPV analysis: HVDC saves {pv_saving:.1f} MUSD vs premium {hvdc_premium:.1f} MUSD → HVDC"
        else:
            key = "HVAC_220kV"
            reason = f"ΔNPV analysis: HVAC cheaper by {hvdc_premium - pv_saving:.1f} MUSD → HVAC 220kV"
    else:
        key = "HVDC_320kV" if installed_mw <= 1000 else "HVDC_525kV"
        reason = f"Distance {distance_km:.0f}km > 200km → HVDC"

    spec = specs[key]
    total_cable_musd = spec["cost_usd_km"] * distance_km / 1e6
    converter_musd = spec.get("converter_station_musd", 0.0)
    reactive_musd = None
    if "HVAC" in key and distance_km > 40:
        # Reactive compensation every 40km
        n_comp = int(distance_km / 40)
        reactive_musd = n_comp * 8.0  # ~8 MUSD per compensation station

    losses_mw = spec["losses_pct_per_100km"] * distance_km / 100 * installed_mw / 100
    # Add converter losses for HVDC
    if "HVDC" in key:
        losses_mw += installed_mw * 0.015  # 1.5% per converter station

    total_musd = total_cable_musd + converter_musd + (reactive_musd or 0.0)

    return ExportCableConfig(
        cable_type=ExportCableType(key),
        length_km=distance_km,
        cost_usd_km=spec["cost_usd_km"],
        total_cost_musd=total_musd,
        reactive_compensation_musd=reactive_musd,
        converter_station_musd=converter_musd if converter_musd > 0 else None,
        losses_mw=losses_mw,
        selection_reason=reason,
    )
