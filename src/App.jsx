import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, ZoomControl, useMap, Circle, Popup, GeoJSON } from "react-leaflet";
import { Thermometer, TreeDeciduous, Sprout, Search, MapPin, Loader2, Leaf, Cpu } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Assets
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";

L.Marker.prototype.options.icon = L.icon({
  iconUrl: icon,
  shadowUrl: shadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// Helper: Smart Zoom that fits bounds (Polygon) or flies to point
function MapController({ coords, boundary }) {
  const map = useMap();
  
  useEffect(() => {
    if (boundary) {
      try {
        const geoJsonLayer = L.geoJSON(boundary);
        map.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50] });
      } catch (e) {
        console.log("Boundary fit error, falling back to flyTo");
        map.flyTo([coords.lat, coords.lng], 10);
      }
    } else {
      map.flyTo([coords.lat, coords.lng], 11, { duration: 2.0 });
    }
  }, [coords, boundary, map]);
  return null;
}

export default function GreenGuardianApp() {
  const [coords, setCoords] = useState({ lat: 11.0168, lng: 76.9558 });
  const [boundary, setBoundary] = useState(null);
  const [query, setQuery] = useState("");
  const [locationName, setLocationName] = useState("Coimbatore, Tamil Nadu");
  const [analysisType, setAnalysisType] = useState("plantation");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Initializing...");
  const [errorMsg, setErrorMsg] = useState(null);

  // Replace the hardcoded string with this:
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://green-guardian-backend-80754738640.asia-south1.run.app";// CHECK YOUR URL

  useEffect(() => {
    // Initial run (Default Coimbatore)
    runAnalysis("plantation", coords, null);
  }, []);

  async function runAnalysis(type, loc, geoJsonPoly) {
    setAnalysisType(type);
    setLoading(true);
    setResult(null); 
    setErrorMsg(null);
    
    if (geoJsonPoly) {
        setLoadingText("Scanning District Boundary...");
    } else {
        setLoadingText("Scanning 15km Radius...");
    }
    
    try {
      setTimeout(() => setLoadingText("Identifying Hotspots..."), 1500); 
      setTimeout(() => setLoadingText("Generating Expert Insight..."), 3000);

      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            analysisType: type, 
            lat: loc.lat, 
            lng: loc.lng,
            geoJson: geoJsonPoly 
        })
      });

      if (!res.ok) throw new Error("Server Connection Failed");

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- NEW: SMART SEARCH LOGIC ---
  async function handleSearch(e) {
    e.preventDefault();
    if (!query) return;
    
    // 1. First Attempt: Direct Search
    let foundLocation = await performSearch(query);

    // 2. Second Attempt: If no polygon found, try appending "District"
    if (!foundLocation || !foundLocation.hasPolygon) {
        console.log("No polygon found initially. Retrying with 'District'...");
        const retryLocation = await performSearch(query + " District");
        
        // If the retry found a polygon, use it. Otherwise keep the original result.
        if (retryLocation && retryLocation.hasPolygon) {
            foundLocation = retryLocation;
        }
    }

    if (foundLocation) {
        setCoords(foundLocation.coords);
        setLocationName(foundLocation.name);
        setBoundary(foundLocation.geoJson);
        setQuery(""); // Clear input
        runAnalysis(analysisType, foundLocation.coords, foundLocation.geoJson);
    } else {
        alert("Location not found. Please try a major city name.");
    }
  }

  // Helper to fetch and scan results
  async function performSearch(searchQuery) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&polygon_geojson=1&limit=5`);
        const data = await res.json();

        if (data && data.length > 0) {
            // Priority: Look for a result that IS a Polygon/MultiPolygon
            const polygonResult = data.find(item => 
                item.geojson && (item.geojson.type === "Polygon" || item.geojson.type === "MultiPolygon")
            );

            // Use the polygon result if found, otherwise just take the first result
            const bestMatch = polygonResult || data[0];
            const hasPolygon = bestMatch === polygonResult;

            return {
                coords: { lat: parseFloat(bestMatch.lat), lng: parseFloat(bestMatch.lon) },
                name: bestMatch.display_name.split(",")[0],
                geoJson: hasPolygon ? bestMatch.geojson : null,
                hasPolygon: hasPolygon
            };
        }
        return null;
    } catch (e) {
        console.error("Search API Error", e);
        return null;
    }
  }

  const formatInsightText = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={index} />;

      if (trimmed.match(/^(Where to grow|Future impacts|Plants to grow|Context|Observation|Recommendation|Action places hotspots to focus):/i)) {
          const parts = trimmed.split(":");
          return (
              <div key={index} style={{ marginBottom: 12 }}>
                  <span className="insight-inline-header">{parts[0]}:</span>
                  {" "}
                  <span className="insight-para">{parts.slice(1).join(":").trim()}</span>
              </div>
          );
      }
      if (trimmed.match(/^\d+\.\s.*|Action places.*:|Plants to grow:|Where to grow:|Future impacts:/i)) {
          if (trimmed.length < 60) return <h4 key={index} className="insight-header">{trimmed}</h4>;
      }
      if (trimmed.includes("Lat:") && trimmed.includes("Lng:")) {
         const parts = trimmed.split("(");
         return (
             <p key={index} className="insight-para hotspot-line">
                {parts[0]} <span className="place-name">({parts[1]}</span>
             </p>
         );
      }
      return <p key={index} className="insight-para">{trimmed}</p>;
    });
  };

  return (
    <div className="dashboard-root">
      
      <div className="map-layer">
        <MapContainer center={[coords.lat, coords.lng]} zoom={11} zoomControl={false} className="leaflet-full">
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" 
            attribution="&copy; CARTO"
          />
          
          {result && !loading && !errorMsg && (
            <>
                {boundary && (
                     <GeoJSON 
                        key={JSON.stringify(boundary)} 
                        data={boundary} 
                        style={{
                            color: result.data.risk_color,
                            fillColor: result.data.risk_color,
                            fillOpacity: 0.15,
                            weight: 2,
                            dashArray: '5, 5'
                        }}
                     />
                )}

                {!boundary && (
                    <Circle 
                    center={[coords.lat, coords.lng]} 
                    radius={15000} 
                    pathOptions={{
                        color: result.data.risk_color,
                        fillColor: result.data.risk_color,
                        fillOpacity: 0.1,
                        weight: 1,
                        dashArray: '4, 4'
                    }}
                    />
                )}

                {result.data.hotspots && result.data.hotspots.map((spot, idx) => (
                    <Circle 
                        key={idx}
                        center={spot}
                        radius={400} 
                        pathOptions={{
                            color: "#0f172a", 
                            fillColor: result.data.risk_color, 
                            fillOpacity: 0.8,
                            weight: 1
                        }}
                    >
                        <Popup className="custom-popup">Hotspot #{idx+1}</Popup>
                    </Circle>
                ))}
            </>
          )}

          <Marker position={[coords.lat, coords.lng]} />
          <MapController coords={coords} boundary={boundary} />
          <ZoomControl position="bottomright" />
        </MapContainer>
      </div>

      {loading && (
        <div className="loading-overlay">
           <div className="loader-box">
              <Loader2 size={48} className="spinner-main" />
              <p className="loading-text">{loadingText}</p>
           </div>
        </div>
      )}

      <aside className="sidebar left-sidebar dark-glass">
        <div className="brand">
          <Leaf className="icon-green" size={24} /> 
          <span>Green-Guardian</span>
        </div>
        
        <form onSubmit={handleSearch} className="search-box">
           <Search size={16} className="search-icon"/>
           <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Location..." />
        </form>

        <div className="menu">
          <button className={analysisType === "plantation" ? "active" : ""} onClick={() => runAnalysis("plantation", coords, boundary)}>
            <Sprout size={18} /> Plantation Scope
          </button>
          <button className={analysisType === "urban_heat" ? "active" : ""} onClick={() => runAnalysis("urban_heat", coords, boundary)}>
            <Thermometer size={18} /> Urban Heat
          </button>
          <button className={analysisType === "deforestation" ? "active" : ""} onClick={() => runAnalysis("deforestation", coords, boundary)}>
            <TreeDeciduous size={18} /> Deforestation
          </button>
        </div>

        <div className="location-badge-container">
            <div className="location-badge">
                <MapPin size={16} /> 
                <span>{locationName}</span>
                {boundary ? 
                  <span style={{marginLeft:'auto', color:'#22c55e', fontSize:'10px', fontWeight:'bold'}}>● DISTRICT</span> 
                  : 
                  <span style={{marginLeft:'auto', color:'#f59e0b', fontSize:'10px', fontWeight:'bold'}}>● RADIUS</span>
                }
            </div>
        </div>
      </aside>

      {result && !loading && !errorMsg && (
        <div className="insight-card-floating dark-glass">
           <div className="card-header" style={{ borderLeftColor: result.data.risk_color }}>
              <div className="risk-badge" style={{ backgroundColor: result.data.risk_color }}>
                {result.data.risk_label} LEVEL
              </div>
              <h2>{result.data.title}</h2>
              <div className="score-row">
                 <span className="big-score">{result.data.risk_score}</span>
                 <span className="total">/100</span>
              </div>
           </div>
           
           <div className="card-body scrollable">
             <div className="ai-tag">
                <Cpu size={14} /> Gemini 2.0 Expert Plan
             </div>
             <div className="ai-content">
                {formatInsightText(result.insight)}
             </div>
           </div>
        </div>
      )}
    </div>
  );
}