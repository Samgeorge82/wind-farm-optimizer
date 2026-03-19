def compute_air_density(temperature_celsius: float, elevation_m: float = 0.0) -> float:
    """
    Standard atmosphere air density (kg/m³).
    Uses barometric formula for pressure at elevation and ideal gas law.
    """
    T_kelvin = temperature_celsius + 273.15
    P_sea_level = 101325.0  # Pa
    g = 9.80665
    R_air = 287.05  # J/(kg·K)
    L = 0.0065   # K/m temperature lapse rate

    T_at_elevation = T_kelvin - L * elevation_m
    P_at_elevation = P_sea_level * (T_at_elevation / T_kelvin) ** (g / (R_air * L))
    rho = P_at_elevation / (R_air * T_at_elevation)
    return rho
