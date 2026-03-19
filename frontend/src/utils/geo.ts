import type { BoundaryPolygon, GeoPoint } from '../types'

const R_EARTH = 6_371_000

export class CoordinateTransformer {
  private originLat: number
  private originLng: number
  public mPerDegLat: number
  public mPerDegLng: number

  constructor(originLat: number, originLng: number) {
    this.originLat = originLat
    this.originLng = originLng
    this.mPerDegLat = (Math.PI / 180) * R_EARTH
    this.mPerDegLng = (Math.PI / 180) * R_EARTH * Math.cos((Math.PI / 180) * originLat)
  }

  static fromBoundary(b: BoundaryPolygon): CoordinateTransformer {
    const avgLat = b.coordinates.reduce((s, c) => s + c.lat, 0) / b.coordinates.length
    const avgLng = b.coordinates.reduce((s, c) => s + c.lng, 0) / b.coordinates.length
    return new CoordinateTransformer(avgLat, avgLng)
  }

  geoToLocal(lat: number, lng: number): { x: number; y: number } {
    return {
      x: (lng - this.originLng) * this.mPerDegLng,
      y: (lat - this.originLat) * this.mPerDegLat,
    }
  }

  localToGeo(x: number, y: number): GeoPoint {
    return {
      lat: y / this.mPerDegLat + this.originLat,
      lng: x / this.mPerDegLng + this.originLng,
    }
  }
}

export function haversineKm(p1: GeoPoint, p2: GeoPoint): number {
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(p2.lat - p1.lat)
  const dLng = toRad(p2.lng - p1.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.sqrt(a)) / 1000
}

export function polygonAreaKm2(coords: GeoPoint[]): number {
  if (coords.length < 3) return 0
  // Shoelace formula on flat earth approximation
  const transformer = CoordinateTransformer.fromBoundary({ coordinates: coords })
  const local = coords.map(c => transformer.geoToLocal(c.lat, c.lng))
  let area = 0
  for (let i = 0; i < local.length; i++) {
    const j = (i + 1) % local.length
    area += local[i].x * local[j].y - local[j].x * local[i].y
  }
  return Math.abs(area) / 2 / 1e6  // m² → km²
}
