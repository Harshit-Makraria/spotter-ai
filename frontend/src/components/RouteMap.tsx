import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { EventKind, TripPlan } from "../types";

/** Visual identity for each kind of stop, shared with the itinerary list. */
export const STOP_STYLE: Record<
  EventKind,
  { glyph: string; colour: string; name: string }
> = {
  drive: { glyph: "→", colour: "#64748b", name: "Driving" },
  pretrip: { glyph: "✓", colour: "#0891b2", name: "Pre-trip inspection" },
  posttrip: { glyph: "✓", colour: "#0891b2", name: "Post-trip inspection" },
  pickup: { glyph: "▲", colour: "#16a34a", name: "Pickup" },
  dropoff: { glyph: "■", colour: "#dc2626", name: "Drop-off" },
  fuel: { glyph: "⛽", colour: "#f59e0b", name: "Fuel stop" },
  break_30: { glyph: "☕", colour: "#8b5cf6", name: "30-minute break" },
  rest_10: { glyph: "🛏", colour: "#2563eb", name: "10-hour reset" },
  restart_34: { glyph: "⏸", colour: "#e11d48", name: "34-hour restart" },
};

function stopIcon(kind: EventKind, active: boolean): L.DivIcon {
  const style = STOP_STYLE[kind];
  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<span class="map-pin${active ? " is-active" : ""}" style="--pin:${
      style.colour
    }">${style.glyph}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function FitToRoute({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(L.latLngBounds(points), { padding: [44, 44] });
  }, [map, points]);
  return null;
}

interface Props {
  plan: TripPlan;
  highlightSegment: number | null;
  onHoverSegment: (index: number | null) => void;
}

/** Watches the theme attribute so the basemap follows light/dark. */
function useMapTone(): "Light" | "Dark" {
  const read = () =>
    document.documentElement.dataset.theme === "dark" ? "Dark" : "Light";
  const [tone, setTone] = useState<"Light" | "Dark">(read);

  useEffect(() => {
    const observer = new MutationObserver(() => setTone(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return tone;
}

export function RouteMap({ plan, highlightSegment, onHoverSegment }: Props) {
  const tone = useMapTone();
  const points = useMemo(
    () => plan.route.geometry as [number, number][],
    [plan.route.geometry],
  );

  const centre = points.length
    ? points[Math.floor(points.length / 2)]
    : ([39.5, -98.35] as [number, number]);

  const stops = plan.stops.filter(
    (stop) => stop.lat !== null && stop.lon !== null,
  );

  return (
    <MapContainer
      center={centre}
      zoom={5}
      scrollWheelZoom
      className="route-map"
      attributionControl
    >
      {/* Esri's canvas basemaps: free, keyless, and muted enough that the amber
          route and the coloured stop pins carry the eye. The `key` forces a
          clean swap when the theme changes. */}
      <TileLayer
        key={`${tone}-base`}
        url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${tone}_Gray_Base/MapServer/tile/{z}/{y}/{x}`}
        attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
        maxZoom={16}
      />
      {/* Place and road labels ride on top so they stay legible over the route. */}
      <TileLayer
        key={`${tone}-labels`}
        url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${tone}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`}
        attribution=""
        maxZoom={16}
      />

      {/* A wide translucent casing under the route reads better on a busy map. */}
      <Polyline
        positions={points}
        pathOptions={{
          color: tone === "Dark" ? "#000000" : "#0f172a",
          weight: 10,
          opacity: 0.22,
        }}
      />
      <Polyline positions={points} pathOptions={{ color: "#f59e0b", weight: 4, opacity: 0.95 }} />

      {stops.map((stop) => (
        <Marker
          key={`${stop.index}-${stop.mile}`}
          position={[stop.lat as number, stop.lon as number]}
          icon={stopIcon(stop.kind, highlightSegment === stop.index)}
          eventHandlers={{
            mouseover: () => onHoverSegment(stop.index),
            mouseout: () => onHoverSegment(null),
          }}
        >
          <Popup>
            <div className="map-popup">
              <strong>{stop.title}</strong>
              <span>{stop.location}</span>
              <span className="map-popup-meta">
                {new Date(stop.start).toLocaleString(undefined, {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {stop.hours} h · mile {stop.mile.toFixed(0)}
              </span>
            </div>
          </Popup>
        </Marker>
      ))}

      <FitToRoute points={points} />
    </MapContainer>
  );
}
