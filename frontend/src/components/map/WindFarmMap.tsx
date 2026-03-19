import React, { useCallback, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Marker, Circle, CircleMarker, Polyline, useMapEvents, LayerGroup, ImageOverlay } from 'react-leaflet'
import L from 'leaflet'
import toast from 'react-hot-toast'
import { useLayoutStore } from '../../store/layoutStore'
import { useTurbineStore } from '../../store/turbineStore'
import { useElectricalStore } from '../../store/electricalStore'
import { useUIStore } from '../../store/uiStore'
import { CoordinateTransformer } from '../../utils/geo'
import type { TurbinePosition, GeoPoint } from '../../types'

// Fix Leaflet default icons
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

function createTurbineIcon(wakeLoss = 0, selected = false) {
  const color = wakeLoss > 0.15 ? '#ef4444' : wakeLoss > 0.05 ? '#f59e0b' : '#22c55e'
  const border = selected ? '#ffffff' : color
  return L.divIcon({
    html: `<svg width="22" height="22" viewBox="-11 -11 22 22">
      <circle r="4" fill="${color}" stroke="${border}" stroke-width="1.5"/>
      <line x1="0" y1="-10" x2="0" y2="-4" stroke="${color}" stroke-width="1.8"/>
      <line x1="0" y1="4" x2="-8.7" y2="9" stroke="${color}" stroke-width="1.8"/>
      <line x1="0" y1="4" x2="8.7" y2="9" stroke="${color}" stroke-width="1.8"/>
    </svg>`,
    className: 'turbine-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function createOSSIcon() {
  return L.divIcon({
    html: `<svg width="24" height="24" viewBox="-12 -12 24 24">
      <polygon points="0,-10 10,0 0,10 -10,0" fill="#8b5cf6" stroke="#ddd6fe" stroke-width="1.5"/>
      <text x="0" y="4" text-anchor="middle" font-size="8" fill="white" font-weight="bold">OSS</text>
    </svg>`,
    className: 'turbine-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function MapEvents({ drawingPoints, setDrawingPoints }: {
  drawingPoints: GeoPoint[]
  setDrawingPoints: React.Dispatch<React.SetStateAction<GeoPoint[]>>
}) {
  const { boundary, addTurbine, setBoundary, setMapMode, mapMode } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()

  const CLOSE_DISTANCE_M = 500 // meters to snap-close polygon

  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng

      // ─── DRAW MODE: accumulate boundary points ───
      if (mapMode === 'draw') {
        const newPoint: GeoPoint = { lat, lng }

        // If 3+ points and click is near the first point, close the polygon
        if (drawingPoints.length >= 3) {
          const first = drawingPoints[0]
          const dist = e.latlng.distanceTo(L.latLng(first.lat, first.lng))
          if (dist < CLOSE_DISTANCE_M) {
            setBoundary({ coordinates: [...drawingPoints] })
            setDrawingPoints([])
            setMapMode('view')
            toast.success(`Boundary set with ${drawingPoints.length} points`)
            return
          }
        }

        setDrawingPoints(prev => [...prev, newPoint])
        return
      }

      // ─── PLACE MODE: add turbine ───
      if (mapMode === 'place') {
        if (!boundary || !selectedTurbine) {
          toast.error(!boundary ? 'Draw boundary first' : 'Select a turbine first')
          return
        }
        const transformer = CoordinateTransformer.fromBoundary(boundary)
        const { x, y } = transformer.geoToLocal(lat, lng)
        addTurbine(lat, lng, x, y)
      }
    },
    dblclick: (e) => {
      // Double-click finishes drawing with 3+ points
      if (mapMode === 'draw' && drawingPoints.length >= 3) {
        e.originalEvent.preventDefault()
        setBoundary({ coordinates: [...drawingPoints] })
        setDrawingPoints([])
        setMapMode('view')
        toast.success(`Boundary set with ${drawingPoints.length} points`)
      }
    },
  })
  return null
}

const CABLE_COLORS: Record<number, string> = {
  95: '#94a3b8',
  150: '#fbbf24',
  240: '#f97316',
  400: '#ef4444',
}

export default function WindFarmMap() {
  const { boundary, turbines, exclusionZones, mapMode, moveTurbine, removeTurbine } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()
  const { network } = useElectricalStore()
  const { showCableLayer: showCables, showWakeHeatmap, wakeFieldImage } = useUIStore()
  const transformer = boundary ? CoordinateTransformer.fromBoundary(boundary) : null
  const [drawingPoints, setDrawingPoints] = useState<GeoPoint[]>([])

  const handleDragEnd = useCallback((id: string, e: any) => {
    const { lat, lng } = e.target.getLatLng()
    if (!transformer) return
    const { x, y } = transformer.geoToLocal(lat, lng)
    moveTurbine(id, lat, lng, x, y)
  }, [transformer, moveTurbine])

  return (
    <MapContainer
      center={[55.5, 5.0]}
      zoom={9}
      style={{ width: '100%', height: '100%' }}
      className="z-0"
      doubleClickZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      <MapEvents drawingPoints={drawingPoints} setDrawingPoints={setDrawingPoints} />

      {/* In-progress drawing polygon */}
      {mapMode === 'draw' && drawingPoints.length > 0 && (
        <>
          {/* Lines between placed points */}
          {drawingPoints.length >= 2 && (
            <Polyline
              positions={drawingPoints.map(p => [p.lat, p.lng])}
              pathOptions={{ color: '#60a5fa', weight: 2, dashArray: '6 4' }}
            />
          )}
          {/* Vertex dots */}
          {drawingPoints.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={i === 0 ? 7 : 4}
              pathOptions={{
                color: i === 0 ? '#22c55e' : '#60a5fa',
                fillColor: i === 0 ? '#22c55e' : '#93c5fd',
                fillOpacity: 0.9,
                weight: 2,
              }}
            />
          ))}
        </>
      )}

      {/* Site boundary */}
      {boundary && (
        <Polygon
          positions={boundary.coordinates.map((c) => [c.lat, c.lng])}
          pathOptions={{ color: '#3b82f6', weight: 2.5, fillOpacity: 0.08 }}
        />
      )}

      {/* Exclusion zones */}
      {exclusionZones.map((z, i) => (
        <Circle
          key={i}
          center={[z.center.lat, z.center.lng]}
          radius={z.radius_m}
          pathOptions={{ color: '#ef4444', fillOpacity: 0.15, dashArray: '6 4' }}
        />
      ))}

      {/* Wake field heatmap overlay */}
      {showWakeHeatmap && wakeFieldImage && (
        <ImageOverlay
          url={wakeFieldImage.dataUrl}
          bounds={wakeFieldImage.bounds}
          opacity={0.75}
          zIndex={200}
        />
      )}

      {/* Array cables */}
      {showCables && network && (
        <LayerGroup>
          {network.strings.flatMap((s) =>
            s.segments.map((seg) => (
              <Polyline
                key={seg.segment_id}
                positions={seg.route_coords.map(([lng, lat]) => [lat, lng])}
                pathOptions={{
                  color: CABLE_COLORS[seg.cable_spec.cross_section_mm2] ?? '#64748b',
                  weight: 2.5,
                  opacity: 0.85,
                }}
              />
            ))
          )}
          {/* OSS marker */}
          <Marker
            position={[network.oss.lat, network.oss.lng]}
            icon={createOSSIcon()}
          />
        </LayerGroup>
      )}

      {/* Turbines */}
      <LayerGroup>
        {turbines.map((t: TurbinePosition) => (
          <React.Fragment key={t.id}>
            <Marker
              position={[t.lat, t.lng]}
              icon={createTurbineIcon(t.wake_loss ?? 0)}
              draggable
              eventHandlers={{
                dragend: (e) => handleDragEnd(t.id, e),
                contextmenu: () => removeTurbine(t.id),
              }}
            />
            {selectedTurbine && (
              <Circle
                center={[t.lat, t.lng]}
                radius={selectedTurbine.rotor_diameter_m / 2}
                pathOptions={{ color: '#94a3b8', weight: 1, fillOpacity: 0.05 }}
              />
            )}
          </React.Fragment>
        ))}
      </LayerGroup>
    </MapContainer>
  )
}
