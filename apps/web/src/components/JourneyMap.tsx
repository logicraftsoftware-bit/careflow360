import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Point = { latitude: number; longitude: number; capturedAt: string; event?: string; stage?: string };

const milestoneLabel = (point: Point, index: number, total: number, completed: boolean) => {
  if (point.event === "ON_THE_WAY" || index === 0) return "Start journey";
  if (point.event === "ARRIVED") return "Arrived";
  if (point.event === "SAMPLE_COLLECTED" || (completed && index === total - 1)) return "Collection submitted";
  return null;
};

export function JourneyMap({ points, completed }: { points: Point[]; completed: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    if (!valid.length) return;
    const map = L.map(element.current, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    const coordinates = valid.map((point) => L.latLng(point.latitude, point.longitude));
    L.polyline(coordinates, { color: "#078F83", weight: 5, opacity: .85 }).addTo(map);
    valid.forEach((point, index) => {
      const label = milestoneLabel(point, index, valid.length, completed);
      if (!label) return;
      const color = label === "Start journey" ? "#2563EB" : label === "Arrived" ? "#F59E0B" : "#059669";
      L.circleMarker([point.latitude, point.longitude], { radius: 9, color: "white", weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(`${label} · ${new Date(point.capturedAt).toLocaleString("en-IN")}`, { permanent: true, direction: "top", className: "journey-tooltip" })
        .addTo(map);
    });
    if (coordinates.length === 1) map.setView(coordinates[0], 16);
    else map.fitBounds(L.latLngBounds(coordinates), { padding: [35, 35] });
    return () => { map.remove(); };
  }, [points, completed]);
  return <div ref={element} style={{ width: "100%", height: 420, borderRadius: 14, overflow: "hidden" }} />;
}
