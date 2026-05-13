import { useState, useEffect, useRef } from "react";
import { NUM2, CTRD } from "../constants";

const W = 1000, H = 507;
const API    = "https://api.openalex.org";
const MAILTO = "gaudio.dev@gmail.com";
const HDR    = 52; // altura header en px
const SB     = 330; // ancho sidebar en px

const proj = ([lon, lat]) => [
  ((lon + 180) / 360) * W,
  ((90 - lat)  / 180) * H,
];

const PALETTE = [
  "#ef4444","#3b82f6","#22c55e","#f97316","#a855f7",
  "#06b6d4","#f59e0b","#ec4899","#14b8a6","#8b5cf6",
  "#84cc16","#f43f5e","#0ea5e9","#10b981","#fb923c",
];

let _id = 0;
const uid = () => ++_id;

export default function PlagaMap() {
  const wrapRef = useRef();   // contenedor raíz (para tooltips)
  const [paths, setPaths] = useState(null);
  const [tt,    setTt]    = useState(null);
  const [pests, setPests] = useState([]);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [selCountry, setSelCountry] = useState(null);
  const [selPestId,  setSelPestId]  = useState(null);
  const [papers,     setPapers]     = useState([]);
  const [papersLoad, setPapersLoad] = useState(false);

  const [zoom,     setZoom]     = useState(1);
  const [pan,      setPan]      = useState({ x:0, y:0 });
  const [dragging, setDragging] = useState(false);
  const svgRef  = useRef();
  const dragRef = useRef(null);

  // ── TopoJSON ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadScript = src => new Promise((res, rej) => {
      if (window.topojson) { res(); return; }
      const ex = document.querySelector(`script[data-id="topojson"]`);
      if (ex) { ex.addEventListener("load", res); return; }
      const s = document.createElement("script");
      s.src = src; s.setAttribute("data-id", "topojson");
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    let cancelled = false;
    loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js")
      .then(() => fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"))
      .then(r => r.json())
      .then(topo => {
        if (cancelled) return;
        const features = window.topojson.feature(topo, topo.objects.countries).features;
        setPaths(features.map(feat => {
          const iso2 = NUM2[parseInt(feat.id)] || null;
          let d = "";
          const geom = feat.geometry;
          if (!geom) return { iso2, d };
          const polys = geom.type === "Polygon" ? [geom.coordinates]
            : geom.type === "MultiPolygon" ? geom.coordinates : [];
          polys.forEach(poly => poly.forEach(ring => {
            if (!ring.length) return;
            const [x0, y0] = proj(ring[0]);
            d += `M${x0.toFixed(1)},${y0.toFixed(1)}`;
            let px = x0;
            for (let i = 1; i < ring.length; i++) {
              const [x, y] = proj(ring[i]);
              d += Math.abs(x - px) > 500
                ? `M${x.toFixed(1)},${y.toFixed(1)}`
                : `L${x.toFixed(1)},${y.toFixed(1)}`;
              px = x;
            }
            d += "Z";
          }));
          return { iso2, d };
        }));
      })
      .catch(() => setPaths([]));
    return () => { cancelled = true; };
  }, []);

  // ── Plagas ────────────────────────────────────────────────────────────
  const addPest = async () => {
    const name = query.trim();
    if (!name) return;
    if (pests.some(p => p.name.toLowerCase() === name.toLowerCase())) { setQuery(""); return; }
    const id    = uid();
    const color = PALETTE[pests.length % PALETTE.length];
    setQuery("");
    setSidebarOpen(true);
    setPests(prev => [...prev, { id, name, color, visible: true, loading: true, countries: {}, total: 0 }]);
    try {
      const url = `${API}/works?search=${encodeURIComponent(name)}&group_by=institutions.country_code&per_page=200&mailto=${MAILTO}`;
      const data = await fetch(url).then(r => r.json());
      const countries = {};
      (data.group_by || []).forEach(({ key, count }) => {
        if (!key) return;
        const iso2 = key.replace(/^https?:\/\/openalex\.org\/countries\//i, "").trim().toUpperCase();
        if (iso2 && iso2 !== "UNKNOWN" && iso2.length <= 3) countries[iso2] = count;
      });
      setPests(prev => prev.map(p =>
        p.id === id ? { ...p, loading: false, countries, total: data.meta?.count || 0 } : p
      ));
    } catch {
      setPests(prev => prev.map(p => p.id === id ? { ...p, loading: false } : p));
    }
  };

  const togglePest = id => setPests(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
  const removePest = id => {
    setPests(prev => prev.filter(p => p.id !== id));
    if (selPestId === id) { setSelPestId(null); setPapers([]); setSelCountry(null); }
  };
  const clearSelection = () => { setSelCountry(null); setSelPestId(null); setPapers([]); };

  // ── Zoom / Pan ────────────────────────────────────────────────────────
  const CX = W / 2, CY = H / 2;

  const zoomAt = (factor) =>
    setZoom(z => Math.min(Math.max(z * factor, 0.5), 8));
  const zoomIn    = () => zoomAt(1.5);
  const zoomOut   = () => zoomAt(1 / 1.5);
  const resetView = () => { setZoom(1); setPan({ x:0, y:0 }); };

  const svgScale = () => {
    const el = wrapRef.current;
    if (!el) return 1;
    return Math.max(el.offsetWidth / W, el.offsetHeight / H);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = svg.getBoundingClientRect();
      const s    = Math.max(rect.width / W, rect.height / H);
      const mx   = (e.clientX - rect.left) / s;
      const my   = (e.clientY - rect.top)  / s;
      setZoom(z => {
        const nz = Math.min(Math.max(z * factor, 0.5), 8);
        setPan(p => ({
          x: (mx - CX) * (1 - factor) + p.x * factor,
          y: (my - CY) * (1 - factor) + p.y * factor,
        }));
        return nz;
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onSvgMouseDown = e => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
    e.preventDefault();
  };
  const onSvgMouseMove = e => {
    if (!dragRef.current) return;
    const s = svgScale();
    setPan({
      x: dragRef.current.px + (e.clientX - dragRef.current.x) / s,
      y: dragRef.current.py + (e.clientY - dragRef.current.y) / s,
    });
  };
  const onSvgMouseUp = () => { dragRef.current = null; setDragging(false); };

  const loadPapers = async (pest, iso2, countryName) => {
    setSelCountry({ iso2, name: countryName });
    setSelPestId(pest.id);
    setPapers([]);
    setPapersLoad(true);
    setSidebarOpen(true);
    try {
      const fields = "id,title,doi,publication_year,authorships,primary_location,open_access";
      const url = `${API}/works?search=${encodeURIComponent(pest.name)}&filter=institutions.country_code:${iso2.toLowerCase()}&per_page=6&select=${fields}&mailto=${MAILTO}`;
      const data = await fetch(url).then(r => r.json());
      setPapers(data.results || []);
    } catch { setPapers([]); }
    finally { setPapersLoad(false); }
  };

  // ── Dots ──────────────────────────────────────────────────────────────
  const dotsByCountry = {};
  pests.filter(p => p.visible && !p.loading).forEach(pest => {
    Object.entries(pest.countries).forEach(([iso2, count]) => {
      if (!dotsByCountry[iso2]) dotsByCountry[iso2] = [];
      dotsByCountry[iso2].push({ pest, count });
    });
  });

  const hasPests    = pests.length > 0;
  const activePests = pests.filter(p => p.visible && !p.loading);
  const totalDots   = Object.keys(dotsByCountry).filter(k => CTRD[k]).length;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} style={{
      position:"relative", width:"100%", height:"100%",
      overflow:"hidden", background:"#b2d8e8",
      fontFamily:"'Inter',system-ui,sans-serif",
    }}>

      {/* ══ MAPA — ocupa todo el espacio ══ */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", display:"block",
          cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
        onMouseUp={onSvgMouseUp}
        onMouseLeave={onSvgMouseUp}
      >
        <rect width={W} height={H} fill="#b2d8e8" onClick={clearSelection} style={{ cursor:"default" }} />

        {paths === null && (
          <text x={500} y={260} textAnchor="middle"
            fill="rgba(255,255,255,.3)" fontSize={14} fontFamily="monospace">
            Cargando mapa…
          </text>
        )}

        {/* ── Grupo con zoom + pan ── */}
        <g transform={`translate(${CX + pan.x},${CY + pan.y}) scale(${zoom}) translate(${-CX},${-CY})`}>
          {paths && paths.map((country, i) => {
            const hasData = !!dotsByCountry[country.iso2];
            return country.d ? (
              <path key={i} d={country.d}
                fill={hasData ? "#1e3a8a" : "#7eb58a"}
                stroke={hasData ? "#3b82f6" : "#142418"}
                strokeWidth={hasData ? 0.6 : 0.25}
                opacity={hasPests ? (hasData ? 0.92 : 0.3) : 0.65}
              />
            ) : null;
          })}

          {!hasPests && paths && (
            <text x={500} y={H/2} textAnchor="middle"
              fill="rgba(255,255,255,.25)" fontSize={13} fontFamily="monospace">
              Agregá una plaga para visualizar su distribución global
            </text>
          )}
        </g>

        {/* Dots — fuera del zoom group: tamaño fijo en pantalla */}
        {Object.entries(dotsByCountry).map(([iso2, pestList]) => {
          const c = CTRD[iso2];
          if (!c) return null;
          const [px, py] = proj([c.lon, c.lat]);
          const scx = (px - CX) * zoom + CX + pan.x;
          const scy = (py - CY) * zoom + CY + pan.y;
          const n       = pestList.length;
          const spacing = 15;
          const startX  = scx - ((n - 1) * spacing) / 2;
          const isSel   = selCountry?.iso2 === iso2;
          return (
            <g key={iso2} style={{ cursor:"pointer" }}
              onMouseMove={e => {
                if (!wrapRef.current) return;
                const r = wrapRef.current.getBoundingClientRect();
                setTt({ x:e.clientX-r.left, y:e.clientY-r.top, name:c.n, pestList });
              }}
              onMouseLeave={() => setTt(null)}
              onClick={e => {
                e.stopPropagation();
                if (selCountry?.iso2 === iso2) { clearSelection(); return; }
                pestList[0] && loadPapers(pestList[0].pest, iso2, c.n);
              }}
            >
              {isSel && <circle cx={scx} cy={scy} r={n*7+13}
                fill="none" stroke="#fff" strokeWidth={2} opacity={0.5} />}
              {pestList.map(({ pest }, idx) => (
                <circle key={`g${pest.id}`}
                  cx={startX + idx*spacing} cy={scy} r={12}
                  fill={pest.color} opacity={0.18} />
              ))}
              {pestList.map(({ pest }, idx) => (
                <circle key={pest.id}
                  cx={startX + idx*spacing} cy={scy} r={7}
                  fill={pest.color} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          );
        })}

      </svg>

      {/* ══ LEYENDA — HTML overlay, dos modos ══ */}
      {activePests.length > 0 && (
        activePests.length <= 2 ? (
          /* Vertical compacto — esquina inferior izquierda */
          <div style={{
            position:"absolute", bottom:12, left:12, zIndex:22,
            background:"rgba(10,18,35,.88)", border:"1px solid rgba(255,255,255,.12)",
            borderRadius:8, padding:"8px 12px", minWidth:160,
            backdropFilter:"blur(4px)",
          }}>
            <div style={{ fontSize:8, color:"rgba(255,255,255,.45)", fontFamily:"monospace",
              letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:7 }}>
              Plagas activas
            </div>
            {activePests.map(pest => (
              <div key={pest.id} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:pest.color, flexShrink:0 }} />
                <span style={{ color:"#fff", fontSize:10, fontFamily:"monospace", whiteSpace:"nowrap" }}>
                  {pest.name.length > 28 ? pest.name.slice(0,28)+"…" : pest.name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          /* Barra horizontal — borde inferior, ancho completo */
          <div style={{
            position:"absolute", bottom:0, left:0,
            right: sidebarOpen ? SB : 0,
            zIndex:22,
            background:"rgba(10,18,35,.91)", borderTop:"1px solid rgba(255,255,255,.12)",
            padding:"6px 56px 6px 14px",
            display:"flex", flexWrap:"wrap", alignItems:"center", gap:"6px 20px",
            backdropFilter:"blur(4px)",
          }}>
            <span style={{ fontSize:8, color:"rgba(255,255,255,.4)", fontFamily:"monospace",
              letterSpacing:"1.5px", textTransform:"uppercase", flexShrink:0 }}>
              Plagas activas
            </span>
            {activePests.map(pest => (
              <div key={pest.id} style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                <div style={{ width:9, height:9, borderRadius:"50%", background:pest.color }} />
                <span style={{ color:"#fff", fontSize:10, fontFamily:"monospace", whiteSpace:"nowrap" }}>
                  {pest.name.length > 30 ? pest.name.slice(0,30)+"…" : pest.name}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* ══ CONTROLES DE ZOOM ══ */}
      <div style={{
        position:"absolute",
        bottom: activePests.length > 2 ? 38 : 16,
        left:16, zIndex:25,
        display:"flex", flexDirection:"column", gap:4,
        transition:"bottom .2s",
      }}>
        {[
          { label:"+", onClick: zoomIn,    title:"Acercar" },
          { label:"⌖", onClick: resetView, title:"Vista inicial" },
          { label:"−", onClick: zoomOut,   title:"Alejar" },
        ].map(({ label, onClick, title }) => (
          <button key={label} onClick={onClick} title={title} style={{
            width:32, height:32, border:"1px solid rgba(255,255,255,.3)",
            background:"rgba(10,18,35,.78)", color:"#fff", cursor:"pointer",
            fontSize: label === "⌖" ? 16 : 20, fontWeight:700,
            display:"flex", alignItems:"center", justifyContent:"center",
            borderRadius:7, backdropFilter:"blur(4px)", lineHeight:1,
            transition:"background .15s",
          }}
            onMouseOver={e => e.currentTarget.style.background="rgba(30,58,138,.9)"}
            onMouseOut={e  => e.currentTarget.style.background="rgba(10,18,35,.78)"}
          >{label}</button>
        ))}
      </div>

      {/* ══ HEADER flotante — top ══ */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:HDR, zIndex:20,
        background:"linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#3b82f6 100%)",
        display:"flex", alignItems:"center", gap:12, padding:"0 16px",
        boxShadow:"0 2px 16px rgba(0,0,0,.5)",
      }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:9, flexShrink:0 }}>
          <svg width="30" height="30" viewBox="0 0 30 30">
            <rect width="30" height="30" rx="7" fill="rgba(255,255,255,.18)"/>
            <circle cx="14" cy="16" r="11" fill="#1d4ed8" opacity={0.7}/>
            <ellipse cx="14" cy="16" rx="5" ry="11" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth=".8"/>
            <line x1="3" y1="16" x2="25" y2="16" stroke="rgba(255,255,255,.3)" strokeWidth=".8"/>
            <line x1="5" y1="10" x2="23" y2="10" stroke="rgba(255,255,255,.2)" strokeWidth=".6"/>
            <line x1="5" y1="22" x2="23" y2="22" stroke="rgba(255,255,255,.2)" strokeWidth=".6"/>
            <circle cx="14" cy="16" r="11" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth=".8"/>
            <ellipse cx="23" cy="7" rx="3.5" ry="5" fill="#fbbf24" transform="rotate(-30,23,7)"/>
            <circle cx="21.5" cy="4.2" r="2.5" fill="#fbbf24"/>
            <circle cx="20.8" cy="3.5" r=".8" fill="#0f172a"/>
            <circle cx="22.4" cy="3.5" r=".8" fill="#0f172a"/>
            <line x1="20.5" y1="2.5" x2="18.5" y2="1" stroke="#fbbf24" strokeWidth=".8" strokeLinecap="round"/>
            <line x1="22.5" y1="2.5" x2="23.5" y2="1" stroke="#fbbf24" strokeWidth=".8" strokeLinecap="round"/>
          </svg>
          <span style={{ color:"#fff", fontWeight:700, fontSize:14, letterSpacing:"-.2px", whiteSpace:"nowrap" }}>
            PlagaMap
            <span style={{ color:"rgba(255,255,255,.45)", fontWeight:400, fontSize:12 }}> · distribución global</span>
          </span>
        </div>

        {/* Buscador */}
        <div style={{ flex:1, display:"flex", gap:8, maxWidth:520 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addPest()}
            placeholder="Nombre científico…  Ej: Sorghum halepense"
            style={{
              flex:1, padding:"7px 13px",
              background:"rgba(255,255,255,.13)", border:"1px solid rgba(255,255,255,.22)",
              borderRadius:8, color:"#fff", fontSize:"0.82rem",
              outline:"none", fontFamily:"inherit",
            }}
          />
          <button onClick={addPest} style={{
            padding:"7px 16px",
            background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.3)",
            borderRadius:8, color:"#fff", fontWeight:700, cursor:"pointer",
            fontSize:"0.82rem", flexShrink:0, transition:"all .2s",
          }}
            onMouseOver={e => e.currentTarget.style.background="rgba(255,255,255,.30)"}
            onMouseOut={e  => e.currentTarget.style.background="rgba(255,255,255,.18)"}
          >+ Agregar</button>
        </div>

        {/* Stats */}
        {hasPests && (
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            {[
              { n: pests.length,  l:"plagas" },
              { n: totalDots,     l:"países" },
            ].map(({ n, l }) => (
              <div key={l} style={{
                background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.18)",
                borderRadius:8, padding:"2px 11px", textAlign:"center",
              }}>
                <div style={{ fontFamily:"monospace", fontSize:14, fontWeight:700, color:"#fff", lineHeight:1 }}>{n}</div>
                <div style={{ fontSize:8, color:"rgba(255,255,255,.5)", textTransform:"uppercase", letterSpacing:1, marginTop:1 }}>{l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Toggle sidebar */}
        <button onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
          style={{
            marginLeft:"auto", width:30, height:30, borderRadius:7, border:"1px solid rgba(255,255,255,.25)",
            background:"rgba(255,255,255,.13)", color:"#fff", cursor:"pointer",
            fontSize:14, display:"flex", alignItems:"center", justifyContent:"center",
            flexShrink:0,
          }}>
          {sidebarOpen ? "▶" : "◀"}
        </button>
      </div>

      {/* ══ SIDEBAR flotante — derecha ══ */}
      <div style={{
        position:"absolute", top:HDR, right: sidebarOpen ? 0 : -SB,
        bottom:0, width:SB, zIndex:15,
        background:"rgba(255,255,255,.97)",
        borderLeft:"1px solid rgba(0,0,0,.12)",
        boxShadow:"-4px 0 20px rgba(0,0,0,.25)",
        display:"flex", flexDirection:"column", overflow:"hidden",
        transition:"right .25s ease",
        backdropFilter:"blur(6px)",
      }}>

        {/* Plagas cargadas */}
        <div style={{
          padding:"14px 14px 10px", borderBottom:"1px solid #e2e8f0", flexShrink:0,
        }}>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:"1.5px",
            textTransform:"uppercase", color:"#64748b", marginBottom:10,
            display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:18, height:18, background:"#eff6ff", borderRadius:4,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:10 }}>🌱</div>
            Plagas cargadas
          </div>

          {pests.length === 0 ? (
            <div style={{ textAlign:"center", padding:"20px 8px", color:"#94a3b8",
              fontSize:"0.7rem", lineHeight:1.8 }}>
              <div style={{ fontSize:"1.8rem", opacity:.18, marginBottom:6 }}>🔬</div>
              Usá el buscador del encabezado para agregar plagas
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {pests.map(pest => (
                <div key={pest.id} style={{
                  display:"flex", alignItems:"center", gap:8, padding:"8px 10px",
                  background: pest.visible ? "#eff6ff" : "#f8fafc",
                  border:`1.5px solid ${pest.visible ? pest.color+"55" : "#e2e8f0"}`,
                  borderRadius:9, transition:"all .15s",
                  opacity: pest.visible ? 1 : 0.5,
                }}>
                  <input type="checkbox" checked={pest.visible} onChange={() => togglePest(pest.id)}
                    style={{ width:13, height:13, accentColor:pest.color, cursor:"pointer", flexShrink:0 }} />
                  <div style={{ width:9, height:9, borderRadius:"50%", background:pest.color,
                    flexShrink:0, boxShadow:`0 0 0 3px ${pest.color}22` }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:"0.7rem", fontWeight:600, color:"#0f172a",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {pest.name}
                    </div>
                    <div style={{ fontFamily:"monospace", fontSize:"0.58rem", color:"#64748b", marginTop:1 }}>
                      {pest.loading ? "Buscando…"
                        : `${Object.keys(pest.countries).length} países · ${pest.total.toLocaleString()} arts.`}
                    </div>
                  </div>
                  {pest.loading
                    ? <div style={{ width:12, height:12, border:"2px solid #e2e8f0",
                        borderTop:`2px solid ${pest.color}`, borderRadius:"50%",
                        animation:"spin .7s linear infinite", flexShrink:0 }} />
                    : <button onClick={() => removePest(pest.id)} style={{
                        background:"none", border:"none", color:"#94a3b8",
                        cursor:"pointer", fontSize:"1.1rem", padding:0, lineHeight:1, flexShrink:0,
                      }}
                        onMouseOver={e => e.currentTarget.style.color="#ef4444"}
                        onMouseOut={e  => e.currentTarget.style.color="#94a3b8"}>×</button>
                  }
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel artículos */}
        {selCountry ? (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"10px 14px", background:"#0f172a", flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <div style={{ fontSize:"0.72rem", fontWeight:700, color:"#fff" }}>
                  📄 {selCountry.name}
                </div>
                <button onClick={clearSelection} title="Cerrar" style={{
                  background:"none", border:"none", color:"rgba(255,255,255,.5)",
                  cursor:"pointer", fontSize:"1rem", lineHeight:1, padding:"0 2px",
                }}
                  onMouseOver={e => e.currentTarget.style.color="#fff"}
                  onMouseOut={e  => e.currentTarget.style.color="rgba(255,255,255,.5)"}>×</button>
              </div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {pests.filter(p => p.visible && p.countries[selCountry.iso2]).map(pest => (
                  <button key={pest.id}
                    onClick={() => loadPapers(pest, selCountry.iso2, selCountry.name)}
                    style={{
                      padding:"3px 8px", borderRadius:5, border:"none", cursor:"pointer",
                      fontFamily:"monospace", fontSize:"0.59rem", fontWeight:700,
                      background: selPestId===pest.id ? pest.color : `${pest.color}30`,
                      color: selPestId===pest.id ? "#fff" : pest.color,
                      transition:"all .15s",
                    }}>
                    {pest.name.length>14?pest.name.slice(0,14)+"…":pest.name}
                    <span style={{ opacity:.7, marginLeft:3 }}>({pest.countries[selCountry.iso2]})</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
              {papersLoad && (
                <div style={{ textAlign:"center", padding:"20px", color:"#64748b", fontSize:"0.7rem" }}>
                  Cargando artículos…
                </div>
              )}
              {!papersLoad && papers.length === 0 && selPestId && (
                <div style={{ textAlign:"center", padding:"20px", color:"#64748b", fontSize:"0.7rem" }}>
                  Sin resultados para este país
                </div>
              )}
              {!papersLoad && papers.map((paper, i) => {
                const doi     = paper.doi?.replace("https://doi.org/","");
                const journal = paper.primary_location?.source?.display_name || "";
                const isOA    = paper.open_access?.is_oa;
                const auths   = (paper.authorships||[]).slice(0,2)
                  .map(a => a.author?.display_name).filter(Boolean).join("; ");
                const extra   = (paper.authorships||[]).length > 2
                  ? ` +${paper.authorships.length-2}` : "";
                const selPest = pests.find(p => p.id === selPestId);
                return (
                  <div key={paper.id||i} style={{
                    background:"#f8fafc", border:"1px solid #e2e8f0",
                    borderLeft:`3px solid ${selPest?.color||"#2563eb"}`,
                    borderRadius:8, padding:"9px 11px", marginBottom:7,
                  }}>
                    <div style={{ fontFamily:"monospace", fontSize:"0.57rem", color:"#64748b", marginBottom:2 }}>
                      {paper.publication_year||"—"}
                      {journal && <span> · {journal.length>26?journal.slice(0,26)+"…":journal}</span>}
                    </div>
                    <div style={{ fontSize:"0.71rem", fontWeight:600, color:"#0f172a",
                      lineHeight:1.38, marginBottom:4 }}>
                      {paper.title||"Sin título"}
                    </div>
                    {auths && (
                      <div style={{ fontSize:"0.59rem", color:"#64748b", marginBottom:5 }}>
                        {auths}{extra}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:5 }}>
                      {doi && (
                        <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize:"0.59rem", padding:"2px 8px", borderRadius:4,
                            background:"#eff6ff", color:"#2563eb",
                            textDecoration:"none", fontWeight:700, border:"1px solid #bfdbfe" }}>
                          ↗ DOI
                        </a>
                      )}
                      {isOA && (
                        <span style={{ fontSize:"0.59rem", padding:"2px 8px", borderRadius:4,
                          background:"#f0fdf4", color:"#16a34a", fontWeight:700,
                          border:"1px solid #bbf7d0" }}>
                          Acceso Abierto
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:10, color:"#94a3b8", padding:20, textAlign:"center" }}>
            <div style={{ fontSize:"2.5rem", opacity:.13 }}>🗺️</div>
            <div style={{ fontSize:"0.7rem", lineHeight:1.7 }}>
              Hacé clic en un punto del mapa para ver artículos científicos de ese país
            </div>
          </div>
        )}
      </div>

      {/* ══ TOOLTIP ══ */}
      {tt && (
        <div style={{
          position:"absolute", zIndex:30, pointerEvents:"none",
          left: Math.min(tt.x+14, (wrapRef.current?.offsetWidth||800) - (sidebarOpen ? SB+10 : 250)),
          top:  Math.max(tt.y-70, HDR+8),
          background:"rgba(10,18,35,.95)", border:"1px solid rgba(255,255,255,.12)",
          borderRadius:10, padding:"10px 14px",
          boxShadow:"0 8px 28px rgba(0,0,0,.5)", minWidth:170,
          fontFamily:"'Inter',system-ui,sans-serif",
        }}>
          <div style={{ fontWeight:700, color:"#fff", fontSize:"0.74rem",
            borderBottom:"1px solid rgba(255,255,255,.1)", paddingBottom:5, marginBottom:6 }}>
            {tt.name}
          </div>
          {tt.pestList.map(({ pest, count }) => (
            <div key={pest.id} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:pest.color, flexShrink:0 }} />
              <span style={{ color:"rgba(255,255,255,.65)", flex:1, fontSize:"0.67rem" }}>
                {pest.name.length>22?pest.name.slice(0,22)+"…":pest.name}
              </span>
              <span style={{ color:pest.color, fontWeight:700, fontFamily:"monospace", fontSize:"0.7rem" }}>
                {count.toLocaleString()}
              </span>
            </div>
          ))}
          <div style={{ fontSize:"0.58rem", color:"rgba(255,255,255,.3)", marginTop:5 }}>
            Clic para ver artículos
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
