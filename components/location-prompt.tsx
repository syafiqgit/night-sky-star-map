"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Navigation, ArrowRight, Loader2, Globe } from "lucide-react";

const DEFAULT_LOCATION = { lat: -6.2088, lon: 106.8456, label: "Jakarta" };

// Daftar 10 kota terkenal
const FAMOUS_CITIES = [
  { label: "Tokyo", lat: 35.6895, lon: 139.6917 },
  { label: "London", lat: 51.5074, lon: -0.1278 },
  { label: "New York", lat: 40.7128, lon: -74.006 },
  { label: "Paris", lat: 48.8566, lon: 2.3522 },
  { label: "Sydney", lat: -33.8688, lon: 151.2093 },
  { label: "Dubai", lat: 25.2048, lon: 55.2708 },
  { label: "Singapore", lat: 1.3521, lon: 103.8198 },
  { label: "Rio", lat: -22.9068, lon: -43.1729 },
  { label: "Cairo", lat: 30.0444, lon: 31.2357 },
  { label: "Los Angeles", lat: 34.0522, lon: -118.2437 },
];

export default function LocationPrompt() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const navigateTo = (latitude: number, longitude: number) => {
    router.push(`/map?lat=${latitude}&lon=${longitude}`);
  };

  const handleGetLocation = () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        navigateTo(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setError(
          "Unable to retrieve location. Please enter coordinates manually.",
        );
        setLoading(false);
      },
    );
  };

  const handleManualSubmit = () => {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      setError("Please enter valid numeric coordinates.");
      return;
    }
    if (parsedLat < -90 || parsedLat > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (parsedLon < -180 || parsedLon > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }

    setError(null);
    navigateTo(parsedLat, parsedLon);
  };

  const handleDefault = () => {
    navigateTo(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon);
  };

  const canSubmitManual = lat.trim() !== "" && lon.trim() !== "";

  return (
    <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl overflow-hidden">
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <MapPin size={20} className="text-blue-400" />
            Set Your Horizon
          </h2>
          <p className="text-sm text-slate-400">
            We need your coordinates to align the celestial sphere.
          </p>
        </div>

        <button
          onClick={handleGetLocation}
          disabled={loading}
          className="group relative flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all duration-200"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>Locating…</span>
            </>
          ) : (
            <>
              <Navigation
                size={20}
                className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
              />
              Use Current Location
            </>
          )}
        </button>

        {/* --- SECTION KOTA TERKENAL --- */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Globe size={14} className="text-slate-500" />
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
              Quick Select
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FAMOUS_CITIES.map((city) => (
              <button
                key={city.label}
                onClick={() => navigateTo(city.lat, city.lon)}
                className="text-left px-4 py-2 rounded-xl bg-white/5 border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/10 text-slate-300 hover:text-blue-300 text-xs transition-all duration-200"
              >
                {city.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-center py-2">
          <hr className="w-full border-slate-800" />
          <span className="absolute bg-[#0b101b] px-3 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
            Manual Input
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">
                Latitude
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. -6.175"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 ml-1">
                Longitude
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 106.82"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          </div>
          <button
            onClick={handleManualSubmit}
            disabled={!canSubmitManual}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed text-blue-400 font-medium text-sm transition-all"
          >
            <ArrowRight size={16} />
            Use These Coordinates
          </button>
        </div>

        {error && (
          <p role="alert" className="text-red-400 text-xs text-center">
            {error}
          </p>
        )}

        <button
          onClick={handleDefault}
          className="flex items-center justify-between w-full px-6 py-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 text-white transition-all group"
        >
          <span className="font-medium text-sm">
            Continue with default ({DEFAULT_LOCATION.label})
          </span>
          <ArrowRight
            size={18}
            className="group-hover:translate-x-1 transition-transform text-slate-500"
          />
        </button>
      </div>
    </div>
  );
}
