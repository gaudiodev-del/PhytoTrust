import { useState, useEffect, useRef } from "react";
import { NUM2, CTRD, MAP_COLORS, P } from "../constants";

const W = 1000, H = 507;
const proj = ([lon, lat]) => [
  ((lon + 180) / 360) * W,
  ((90 - lat) / 180) * H,
];

export default function WorldMap({presencia}) {
  const [paths, setPaths] = useState(null); // null=cargando, []=error, array=ok
  const [tt, setTt] = useState(null);
  const ref = useRef();

  useEffect(() => {
    let cancelled = false;

    const loadScript = src => new Promise((resolve, reject) => {
      if (window.topojson) { resolve(); return; }
      const existing = document.querySelector(`script[data-id="topojson"]`);
      if (existing) { existing.addEventListener("load", resolve); return; }
      const s = document.createElement("script");
      s.src = src;
      s.setAttribute("data-id", "topojson");
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js")
      .then(() => fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"))
      .then(r => r.json())
      .then(topo => {
        if (cancelled) return;
        const features = window.topojson.feature(topo, topo.objects.countries).features;
        const result = features.map(feat => {
          const iso2 = NUM2[parseInt(feat.id)] || null;
          let d = "";
          const geom = feat.geometry;
          if (!geom) return { iso2, d };
          const polys = geom.type === "Polygon" ? [geom.coordinates]
            : geom.type === "MultiPolygon" ? geom.coordinates : [];
          polys.forEach(poly => {
            poly.forEach(ring => {
              if (!ring.length) return;
              const [x0, y0] = proj(ring[0]);
              d += `M${x0.toFixed(1)},${y0.toFixed(1)}`;
              let prevX = x0;
              for (let i = 1; i < ring.length; i++) {
                const [x, y] = proj(ring[i]);
                if (Math.abs(x - prevX) > 500) {
                  d += `M${x.toFixed(1)},${y.toFixed(1)}`;
                } else {
                  d += `L${x.toFixed(1)},${y.toFixed(1)}`;
                }
                prevX = x;
              }
              d += "Z";
            });
          });
          return { iso2, d };
        });
        setPaths(result);
      })
      .catch(() => setPaths([]));

    return () => { cancelled = true; };
  }, []);

  const pMap = Object.fromEntries((presencia || []).map(p => [p.iso, p]));
  const counts = { presente: 0, cuarentena: 0, ausente_riesgo: 0, erradicada: 0 };
  (presencia || []).forEach(p => { if (counts[p.estado] !== undefined) counts[p.estado]++; });

  return (
    <div ref={ref} style={{ background: "#d0e4f0", border: `1px solid ${P.border}`, borderRadius: 8, overflow: "hidden", userSelect: "none", position: "relative" }}>
      <svg viewBox="0 0 1000 507" style={{ width: "100%", display: "block" }} className="fitofichas-worldmap-svg">
        {/* Océano */}
        <rect width={1000} height={507} fill="#b8d0e8" />

        {paths === null && (
          <text x={500} y={260} textAnchor="middle" fill="#3a6080" fontSize={13} fontFamily="monospace">Cargando mapa…</text>
        )}

        {/* Países coloreados */}
        {paths && paths.map((c, i) => {
          const pres = pMap[c.iso2];
          const fill = pres ? (MAP_COLORS[pres.estado]?.fill || "#e0e8d0") : "#dde8cc";
          const stroke = pres ? (MAP_COLORS[pres.estado]?.stroke || "#b8c8a0") : "#c0ceb0";
          return c.d ? (
            <path key={i} d={c.d}
              fill={fill} stroke={stroke} strokeWidth={pres ? 0.6 : 0.4}
              opacity={pres ? 0.88 : 0.75}
              style={{ cursor: pres ? "pointer" : "default" }}
              onMouseMove={e => {
                if (!pres || !ref.current) return;
                const r = ref.current.getBoundingClientRect();
                setTt({ x: e.clientX - r.left, y: e.clientY - r.top, name: pres.nombre || c.iso2, st: pres.estado, col: MAP_COLORS[pres.estado]?.fill });
              }}
              onMouseLeave={() => setTt(null)}
            />
          ) : null;
        })}

        {/* Puntos encima de los países con dato */}
        {paths && Object.entries(pMap).map(([iso2, pres]) => {
          const c = CTRD[iso2];
          if (!c) return null;
          const [cx, cy] = proj([c.lon, c.lat]);
          const col = MAP_COLORS[pres.estado] || MAP_COLORS.presente;
          const isARG = !!c.arg;
          return (
            <g key={iso2} style={{ cursor: "pointer" }}
              onMouseMove={e => {
                if (!ref.current) return;
                const r = ref.current.getBoundingClientRect();
                setTt({ x: e.clientX - r.left, y: e.clientY - r.top, name: pres.nombre || c.n, st: pres.estado, col: col.fill });
              }}
              onMouseLeave={() => setTt(null)}>
              {isARG && <circle cx={cx} cy={cy} r={14} fill="none" stroke="#fff" strokeWidth={2.5} opacity={0.8} />}
              {isARG && <circle cx={cx} cy={cy} r={14} fill="none" stroke={col.fill} strokeWidth={2} opacity={0.9} />}
              <circle cx={cx} cy={cy} r={isARG ? 8 : 5}
                fill={col.fill} stroke="#fff" strokeWidth={isARG ? 2 : 1.5} />
              {isARG && (
                <text x={cx} y={cy + 24} textAnchor="middle"
                  fill={P.navy} fontSize={8} fontFamily="monospace" fontWeight="bold">ARG</text>
              )}
            </g>
          );
        })}

        {/* Leyenda */}
        <rect x={4} y={386} width={262} height={121} rx={4} fill="rgba(255,255,255,.94)" stroke="#a8c4d8" strokeWidth={0.8} />
        <text x={14} y={403} fill={P.navy} fontSize={13} fontFamily="monospace" fontWeight="bold">LEYENDA</text>
        {Object.entries(MAP_COLORS).map(([k, { fill, label }], i) => (
          <g key={k} transform={`translate(11,${412 + i * 23})`}>
            <circle cx={7} cy={7} r={7} fill={fill} stroke="#fff" strokeWidth={1} />
            <text x={20} y={11.5} fill={P.navy} fontSize={14} fontFamily="monospace">{label}</text>
          </g>
        ))}
      </svg>

      {tt && (
        <div style={{
          position: "absolute",
          left: Math.min(tt.x + 12, (ref.current?.offsetWidth || 700) - 200),
          top: Math.max(tt.y - 42, 4),
          background: "#fff", border: `2px solid ${tt.col}`, borderRadius: 6,
          padding: "5px 11px", fontFamily: "monospace", fontSize: "0.68rem", color: P.navy,
          pointerEvents: "none", whiteSpace: "nowrap",
          boxShadow: "0 2px 10px rgba(7,25,58,.2)", zIndex: 20,
        }}>
          <strong>{tt.name}</strong><br />
          <span style={{ color: tt.col }}>{MAP_COLORS[tt.st]?.label}</span>
        </div>
      )}

      {/* Contadores */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "7px 12px", background: P.blueLL, borderTop: `1px solid ${P.border}` }}>
        {Object.entries(MAP_COLORS).filter(([k]) => counts[k] > 0).map(([k, { fill, label }]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "monospace", fontSize: "0.6rem", color: P.txt2 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: fill, flexShrink: 0 }} />
            <span>{label}: <strong style={{ color: fill }}>{counts[k]}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}
