import { useState, useRef, useEffect } from "react";
import { P } from "../constants";
import { sbReady } from "../lib/supabase";
import { dbLoadSets, dbUpsertSet, dbDeleteSet, dbDeleteAllSets, dbLoadEquipos, dbLoadFavoritosCompartidos, dbUpsertFavoritoCompartido, dbDeleteFavoritoCompartido } from "../services/db";

// ── Storage ────────────────────────────────────────────────────────────────────
const SK_SETS = "agrofichas-search-sets-v2";
const SK_FAVS = "fitofichas-favoritos-v1";

// ── Utilidades ─────────────────────────────────────────────────────────────────
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function dominio(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Arma la query uniendo todas las palabras (las APIs priorizan resultados con todos los términos)
function buildQuery(keywords) {
  return keywords.join(" ");
}

// Verifica que todas las palabras significativas de un keyword aparezcan en el texto
function cumplePalabras(texto, kw) {
  const palabras = kw.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);
  return palabras.every(p => texto.includes(p));
}

function fmtFecha(s) {
  if (!s) return "";
  const p = String(s).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

// Reconstruye el abstract desde el índice invertido de OpenAlex
function reconstruirAbstract(invIdx) {
  if (!invIdx) return "";
  const words = [];
  for (const [word, positions] of Object.entries(invIdx)) {
    for (const pos of positions) { words[pos] = word; }
  }
  return words.filter(Boolean).join(" ");
}

// Detección de idioma por heurística (para filtrado client-side en CrossRef)
function detectarIdioma(texto) {
  const t = (texto || "").toLowerCase();
  const es = (t.match(/[áéíóúñü]/g) || []).length * 2 +
             (t.match(/\b(de|la|el|en|que|una|para|por|con|del|se|los|las)\b/g) || []).length;
  const en = (t.match(/\b(the|of|in|an|to|for|by|from|with|and|is|are|was|were)\b/g) || []).length;
  const fr = (t.match(/[àâæçèêëîïôœùûü]/g) || []).length * 2 +
             (t.match(/\b(de|la|le|les|du|des|en|un|une|pour|par|avec|est|dans|sur|que)\b/g) || []).length;
  const max = Math.max(es, en, fr);
  if (max === 0) return null;
  if (fr > es * 1.2 && fr > en * 1.2) return "fr";
  if (es > en * 1.2 && es > fr * 1.2) return "es";
  if (en > es * 1.2 && en > fr * 1.2) return "en";
  return null;
}

// ── Fuentes de búsqueda (100% gratuitas, sin API Key) ─────────────────────────

async function buscarOpenAlex(keywords, desdeF, hastaF, maxR, onProgreso, idioma) {
  const filtros = [];
  if (desdeF) filtros.push(`from_publication_date:${desdeF}`);
  if (hastaF) filtros.push(`to_publication_date:${hastaF}`);
  if (idioma) filtros.push(`language:${idioma}`);

  const params = new URLSearchParams({
    search: buildQuery(keywords),
    "per-page": Math.min(maxR, 200),
    select: "id,title,abstract_inverted_index,authorships,publication_date,primary_location,doi,open_access",
  });
  if (filtros.length) params.set("filter", filtros.join(","));

  const resp = await fetch(`https://api.openalex.org/works?${params}`);
  if (!resp.ok) throw new Error(`OpenAlex respondió con error ${resp.status}`);
  const data = await resp.json();

  const resultados = (data.results || []).slice(0, maxR);
  onProgreso?.(resultados.length, maxR);

  return resultados.map(w => ({
    id: genId(),
    titulo: w.title || "Sin título",
    fechaPublicacion: w.publication_date?.slice(0, 10) || null,
    autores: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean).slice(0, 5),
    url: w.primary_location?.landing_page_url || w.doi || w.id || "",
    dominio: w.primary_location?.source?.display_name || "OpenAlex",
    descripcion: reconstruirAbstract(w.abstract_inverted_index),
    textoCompleto: null,
    leido: false,
    favorito: false,
    calificacion: 0,
    obtenidoEl: new Date().toISOString(),
  }));
}

async function buscarCrossRef(keywords, desdeF, hastaF, maxR, onProgreso, idioma) {
  const filtros = [];
  if (desdeF) filtros.push(`from-pub-date:${desdeF}`);
  if (hastaF) filtros.push(`until-pub-date:${hastaF}`);

  // Pedir el doble cuando hay filtro de idioma para compensar el descarte client-side
  const fetchRows = idioma ? Math.min(maxR * 2, 100) : Math.min(maxR, 100);
  const params = new URLSearchParams({
    query: buildQuery(keywords),
    rows: fetchRows,
    select: "title,author,published,abstract,DOI,URL,container-title",
  });
  if (filtros.length) params.set("filter", filtros.join(","));

  const resp = await fetch(`https://api.crossref.org/works?${params}`);
  if (!resp.ok) throw new Error(`CrossRef respondió con error ${resp.status}`);
  const data = await resp.json();

  const items = (data.message?.items || []).slice(0, fetchRows);

  let resultados = items.map(item => {
    const dp = item.published?.["date-parts"]?.[0] || [];
    const fecha = dp.length >= 2
      ? `${dp[0]}-${String(dp[1]).padStart(2, "0")}-${String(dp[2] || 1).padStart(2, "0")}`
      : dp[0] ? String(dp[0]) : null;

    return {
      id: genId(),
      titulo: Array.isArray(item.title) ? item.title[0] : (item.title || "Sin título"),
      fechaPublicacion: fecha,
      autores: (item.author || [])
        .map(a => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean),
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ""),
      dominio: item["container-title"]?.[0] || "CrossRef",
      descripcion: (item.abstract || "").replace(/<[^>]+>/g, ""),
      textoCompleto: null,
      leido: false,
      favorito: false,
      calificacion: 0,
      obtenidoEl: new Date().toISOString(),
    };
  });

  if (idioma) {
    resultados = resultados.filter(a => {
      const det = detectarIdioma(`${a.titulo} ${a.descripcion}`);
      return det === idioma || det === null;
    });
  }

  onProgreso?.(resultados.length, maxR);
  return resultados.slice(0, maxR);
}

const FUENTES = {
  openalex: {
    label: "OpenAlex",
    desc: "200M+ artículos científicos · Muy bueno para agronomía",
    fn: buscarOpenAlex,
  },
  crossref: {
    label: "CrossRef",
    desc: "150M+ publicaciones académicas · DOI y revistas",
    fn: buscarCrossRef,
  },
};

async function obtenerTextoCompleto(url) {
  const resp = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain", "X-Return-Format": "text" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.text()).trim().slice(0, 6000);
}

// ── Calificación con estrellas ─────────────────────────────────────────────────
function Estrellas({ valor, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n}
          onClick={() => onChange(n === valor ? 0 : n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          title={`${n} estrella${n > 1 ? "s" : ""}`}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 1, fontSize: 17, lineHeight: 1,
            color: n <= (hover || valor) ? "#f59e0b" : "#d1d5db",
            transition: "color .1s",
          }}
        >
          {n <= (hover || valor) ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

// ── Input de palabras clave ────────────────────────────────────────────────────
function PalabrasInput({ valor, onChange }) {
  const [inp, setInp] = useState("");
  const ref = useRef(null);

  const agregar = () => {
    const v = inp.trim().replace(/[,;]+$/, "").trim();
    if (v && !valor.includes(v) && valor.length < 12) {
      onChange([...valor, v]); setInp("");
    }
  };

  return (
    <div onClick={() => ref.current?.focus()} style={{
      display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center",
      padding: "7px 10px", background: "#fff",
      border: `1.5px solid ${P.border2}`, borderRadius: 6,
      cursor: "text", minHeight: 44,
    }}>
      {valor.map(kw => (
        <span key={kw} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: P.blueL, border: `1px solid ${P.border}`,
          color: P.navy, fontFamily: "monospace", fontSize: "0.72rem",
          padding: "2px 8px", borderRadius: 20, fontWeight: 600,
        }}>
          {kw}
          <button onClick={e => { e.stopPropagation(); onChange(valor.filter(k => k !== kw)); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: P.txt3, lineHeight: 1, padding: 0, fontSize: "0.88rem" }}>
            ×
          </button>
        </span>
      ))}
      <input ref={ref} value={inp} onChange={e => setInp(e.target.value)}
        onKeyDown={e => {
          if (["Enter", "Tab", ","].includes(e.key)) { e.preventDefault(); agregar(); }
          if (e.key === "Backspace" && !inp && valor.length) onChange(valor.slice(0, -1));
        }}
        placeholder={valor.length === 0 ? "Palabra clave + Enter…" : "Agregar más…"}
        style={{
          border: "none", outline: "none", background: "transparent",
          fontSize: "0.78rem", color: P.txt, fontFamily: "inherit",
          minWidth: 150, flex: 1,
        }}
      />
    </div>
  );
}

// ── Ficha de artículo ──────────────────────────────────────────────────────────
function FichaArticulo({ articulo, onActualizar }) {
  const [expandido, setExpandido] = useState(false);
  const [cargandoTxt, setCargandoTxt] = useState(false);
  const [errTxt, setErrTxt] = useState(null);

  const cargarTexto = async () => {
    setCargandoTxt(true); setErrTxt(null);
    try {
      const texto = await obtenerTextoCompleto(articulo.url);
      onActualizar({ textoCompleto: texto });
      setExpandido(true);
    } catch (e) { setErrTxt(e.message); }
    finally { setCargandoTxt(false); }
  };

  return (
    <div style={{
      background: articulo.favorito ? "#fffbf0" : articulo.leido ? "#f5f9ff" : "#fff",
      border: `1px solid ${articulo.favorito ? "#f59e0b" : P.border}`,
      borderLeft: `4px solid ${articulo.favorito ? "#f59e0b" : articulo.leido ? P.accent : "#c0d0e8"}`,
      borderRadius: 8, marginBottom: 10, overflow: "hidden",
      transition: "background .15s",
    }}>
      {/* Encabezado */}
      <div style={{ padding: "11px 14px" }}>

        {/* Título + botones */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 7 }}>
          <button onClick={() => onActualizar({ favorito: !articulo.favorito })}
            title={articulo.favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
            style={{
              background: articulo.favorito ? "#fff3c4" : P.bg,
              border: `1px solid ${articulo.favorito ? "#f59e0b" : P.border}`,
              color: articulo.favorito ? "#b45309" : P.txt3,
              borderRadius: 6, cursor: "pointer", padding: "5px 9px",
              fontSize: "0.92rem", lineHeight: 1, flexShrink: 0, transition: "all .12s",
            }}>🚩</button>
          <button onClick={() => onActualizar({ leido: !articulo.leido })}
            title={articulo.leido ? "Marcar como no leído" : "Marcar como leído"}
            style={{
              background: articulo.leido ? P.accentL : P.bg,
              border: `1px solid ${articulo.leido ? "#9fe1cb" : P.border}`,
              color: articulo.leido ? P.accent : P.txt3,
              borderRadius: 6, cursor: "pointer", padding: "5px 9px",
              fontSize: "0.92rem", lineHeight: 1, flexShrink: 0, transition: "all .12s",
            }}>
            {articulo.leido ? "📗" : "📘"}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <a href={articulo.url} target="_blank" rel="noopener noreferrer"
              style={{
                fontWeight: 600, color: P.navy, textDecoration: "none",
                fontSize: "0.91rem", lineHeight: 1.36, display: "block", wordBreak: "break-word",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = P.blue; }}
              onMouseLeave={e => { e.currentTarget.style.color = P.navy; }}>
              {articulo.titulo}
            </a>
          </div>
        </div>

        {/* Metadatos */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9, paddingLeft: 44 }}>
          {articulo.dominio && (
            <span style={{
              fontFamily: "monospace", fontSize: "0.6rem", color: P.txt3,
              background: P.bg, border: `1px solid ${P.border}`,
              borderRadius: 3, padding: "1px 7px",
            }}>📰 {articulo.dominio}</span>
          )}
          {articulo.fechaPublicacion && (
            <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.txt3 }}>
              📅 {fmtFecha(articulo.fechaPublicacion)}
            </span>
          )}
          {articulo.autores?.length > 0 && (
            <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.txt3 }}>
              ✍ {articulo.autores.slice(0, 3).join(", ")}{articulo.autores.length > 3 ? " …" : ""}
            </span>
          )}
          {articulo.leido && (
            <span style={{
              fontFamily: "monospace", fontSize: "0.58rem", color: P.accent,
              background: P.accentL, padding: "1px 8px", borderRadius: 20, border: "1px solid #9fe1cb",
            }}>✓ Leído</span>
          )}
        </div>

        {/* Calificación */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 44 }}>
          <span style={{
            fontFamily: "monospace", fontSize: "0.58rem", color: P.txt3,
            textTransform: "uppercase", letterSpacing: ".06em",
          }}>Calificación:</span>
          <Estrellas valor={articulo.calificacion} onChange={v => onActualizar({ calificacion: v })} />
          {articulo.calificacion > 0 && (
            <span style={{ fontFamily: "monospace", fontSize: "0.62rem", color: P.gold }}>
              {articulo.calificacion}/5
            </span>
          )}
        </div>
      </div>

      {/* Descripción / Abstract */}
      {articulo.descripcion && (
        <div style={{
          padding: "9px 14px 10px", fontSize: "0.79rem", color: P.txt2,
          lineHeight: 1.65, borderTop: `1px solid ${P.border}`,
        }}>
          {articulo.descripcion}
        </div>
      )}

      {/* Texto completo */}
      <div style={{ padding: "8px 14px", background: P.bg, borderTop: `1px solid ${P.border}` }}>
        {!articulo.textoCompleto ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={cargarTexto} disabled={cargandoTxt} style={{
              fontFamily: "monospace", fontSize: "0.64rem", fontWeight: 600,
              padding: "4px 12px", borderRadius: 4,
              cursor: cargandoTxt ? "wait" : "pointer",
              border: `1px solid ${P.border2}`, background: "#fff", color: P.blue,
            }}>
              {cargandoTxt ? "⏳ Cargando…" : "📄 Cargar texto completo"}
            </button>
            {errTxt && (
              <span style={{ fontFamily: "monospace", fontSize: "0.62rem", color: P.red }}>⚠ {errTxt}</span>
            )}
          </div>
        ) : (
          <div>
            <button onClick={() => setExpandido(!expandido)} style={{
              fontFamily: "monospace", fontSize: "0.64rem", fontWeight: 600,
              padding: "4px 12px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${P.border2}`, background: "#fff", color: P.navy,
            }}>
              {expandido ? "▲ Ocultar texto" : `▼ Ver texto completo (${articulo.textoCompleto.length} car.)`}
            </button>
            {expandido && (
              <div style={{
                marginTop: 10, fontSize: "0.77rem", color: P.txt2, lineHeight: 1.72,
                maxHeight: 420, overflowY: "auto", padding: "10px 12px",
                background: "#fff", border: `1px solid ${P.border}`, borderRadius: 5,
                fontFamily: "Georgia, serif", whiteSpace: "pre-wrap",
              }}>
                {articulo.textoCompleto}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sección de favoritos ───────────────────────────────────────────────────────
function SeccionFavoritos({ favoritos, equiposMios, misCompartidos, compartidosConmigo, onActualizar, onCompartir, onDescompartir }) {
  const [abierto, setAbierto] = useState(false);
  const total = favoritos.length + compartidosConmigo.length;
  if (total === 0) return null;

  return (
    <div style={{
      background: "#fff", border: "1.5px solid #f59e0b",
      borderRadius: 10, marginBottom: 20, overflow: "hidden",
      boxShadow: "0 2px 12px rgba(245,158,11,.15)",
    }}>
      <div onClick={() => setAbierto(!abierto)} style={{
        padding: "12px 16px",
        background: "linear-gradient(135deg, #92400e 0%, #b45309 100%)",
        cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: "#fde68a", fontSize: "0.82rem", flexShrink: 0 }}>
          {abierto ? "▼" : "▶"}
        </span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "1rem" }}>🚩</span>
          <span style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: "1rem" }}>Favoritos</span>
          <span style={{ fontFamily: "monospace", fontSize: "0.64rem", fontWeight: 700, color: "#92400e", background: "#fde68a", padding: "2px 10px", borderRadius: 20 }}>
            {favoritos.length} propio{favoritos.length !== 1 ? "s" : ""}
          </span>
          {compartidosConmigo.length > 0 && (
            <span style={{ fontFamily: "monospace", fontSize: "0.64rem", fontWeight: 700, color: "#fff", background: "rgba(255,255,255,.25)", padding: "2px 10px", borderRadius: 20 }}>
              👥 {compartidosConmigo.length} compartido{compartidosConmigo.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {abierto && (
        <div style={{ padding: "14px 16px" }}>
          {/* Mis favoritos */}
          {favoritos.map(art => {
            const equiposYaCompartidos = new Set(misCompartidos.filter(c => c.articulo_id === art.id).map(c => c.equipo_id));
            return (
              <div key={art.id}>
                {art._keywords?.length > 0 && (
                  <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "2px 8px", marginBottom: 4, display: "inline-flex", gap: 5 }}>
                    {art._keywords.map(k => <span key={k}>#{k}</span>)}
                  </div>
                )}
                <FichaArticulo articulo={art} onActualizar={upd => onActualizar(art.id, upd)} />
                {/* Compartir con equipo */}
                {equiposMios.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "6px 10px 10px", borderBottom: `1px solid #fde68a`, marginBottom: 12 }}>
                    <span style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#92400e", flexShrink: 0 }}>Compartir con equipo:</span>
                    {equiposMios.map(eq => {
                      const yaCompartido = equiposYaCompartidos.has(eq.id);
                      return (
                        <button key={eq.id}
                          onClick={() => yaCompartido ? onDescompartir(art.id, eq.id) : onCompartir(art, eq.id)}
                          style={{
                            fontFamily: "monospace", fontSize: "0.64rem", fontWeight: 600,
                            padding: "3px 11px", borderRadius: 20, cursor: "pointer",
                            border: `1.5px solid ${yaCompartido ? P.accent : P.border2}`,
                            background: yaCompartido ? P.accentL : "#fff",
                            color: yaCompartido ? P.accent : P.txt2,
                            transition: "all .12s",
                          }}>
                          {yaCompartido ? "✓" : "+"} {eq.nombre}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Compartidos conmigo */}
          {compartidosConmigo.length > 0 && (
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.txt3, textTransform: "uppercase", letterSpacing: ".07em", padding: "8px 0 10px", borderTop: `1px solid ${P.border}`, marginTop: 4 }}>
                👥 Compartidos con vos
              </div>
              {compartidosConmigo.map(c => (
                <div key={c.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: P.txt3, background: P.bg, border: `1px solid ${P.border}`, borderRadius: 4, padding: "2px 8px", marginBottom: 4, display: "inline-flex", gap: 6 }}>
                    <span>👤 {c.compartido_por}</span>
                    <span>·</span>
                    <span>{equiposMios.find(e => e.id === c.equipo_id)?.nombre || c.equipo_id}</span>
                  </div>
                  <FichaArticulo articulo={c.articulo} onActualizar={() => {}} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de set de búsqueda ─────────────────────────────────────────────────
function SetBusqueda({ set, onEliminar, onActualizarArticulo }) {
  const [abierto, setAbierto] = useState(false);
  const { params, articulos, creadoEl, estado, error } = set;
  const leidosCnt = articulos.filter(a => a.leido).length;
  const califCnt  = articulos.filter(a => a.calificacion > 0).length;
  const promCalif = califCnt > 0
    ? (articulos.reduce((s, a) => s + a.calificacion, 0) / califCnt).toFixed(1)
    : null;

  const fuenteLabel = FUENTES[params.fuente]?.label || params.fuente || "";

  return (
    <div style={{
      background: "#fff", border: `1px solid ${P.border}`,
      borderRadius: 10, marginBottom: 16,
      boxShadow: "0 2px 8px rgba(7,25,58,.05)", overflow: "hidden",
    }}>
      {/* Cabecera */}
      <div onClick={() => setAbierto(!abierto)} style={{
        padding: "12px 16px", background: P.navy,
        cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: "#aac4e0", fontSize: "0.82rem", flexShrink: 0 }}>
          {abierto ? "▼" : "▶"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 4, alignItems: "center" }}>
            {params.keywords.map(kw => (
              <span key={kw} style={{
                background: "rgba(255,255,255,.18)", color: "#fff",
                fontFamily: "monospace", fontSize: "0.68rem",
                padding: "2px 9px", borderRadius: 20, fontWeight: 600,
              }}>{kw}</span>
            ))}
            {fuenteLabel && (
              <span style={{
                background: "rgba(29,158,117,.3)", color: "#7de8c8",
                fontFamily: "monospace", fontSize: "0.6rem",
                padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(29,158,117,.4)",
              }}>{fuenteLabel}</span>
            )}
            {params.idioma && (
              <span style={{
                background: "rgba(255,255,255,.15)", color: "#ddeeff",
                fontFamily: "monospace", fontSize: "0.6rem",
                padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(255,255,255,.2)",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <img
                  src={`https://flagcdn.com/16x12/${params.idioma === "en" ? "gb" : params.idioma}.png`}
                  alt={params.idioma}
                  style={{ width: 16, height: 12, borderRadius: 1 }}
                />
                {params.idioma === "es" ? "Español" : params.idioma === "fr" ? "Français" : "Inglés"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(params.dateFrom || params.dateTo) && (
              <span style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#7090b0" }}>
                📅 {params.dateFrom ? fmtFecha(params.dateFrom) : "—"} → {params.dateTo ? fmtFecha(params.dateTo) : "hoy"}
              </span>
            )}
            <span style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#7090b0" }}>
              🕐 {new Date(creadoEl).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {estado === "cargando" && (
            <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.gold, background: P.goldL, padding: "2px 8px", borderRadius: 20 }}>⏳ Buscando…</span>
          )}
          {estado === "ok" && (
            <>
              <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: "#7090b0" }}>
                {leidosCnt}/{articulos.length} leídos
              </span>
              {promCalif && (
                <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: "#f59e0b" }}>★ {promCalif}</span>
              )}
              <span style={{
                fontFamily: "monospace", fontSize: "0.64rem", fontWeight: 700,
                color: "#fff", background: P.blue2, padding: "2px 10px", borderRadius: 20,
              }}>{articulos.length} art.</span>
            </>
          )}
          {estado === "error" && (
            <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.red, background: P.redL, padding: "2px 8px", borderRadius: 20 }}>⚠ Error</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); if (window.confirm(`¿Eliminar este set (${articulos.length} artículos)?`)) onEliminar(); }}
            title="Eliminar set"
            style={{
              background: "rgba(255,80,80,.18)", border: "1px solid rgba(255,80,80,.35)",
              color: "#ff9090", borderRadius: 5, cursor: "pointer", padding: "3px 8px", fontSize: "0.8rem",
            }}>🗑</button>
        </div>
      </div>

      {estado === "error" && (
        <div style={{ padding: "10px 16px", background: P.redL, borderBottom: `1px solid #e0a0a0`, fontFamily: "monospace", fontSize: "0.72rem", color: P.red }}>
          ⚠ {error}
        </div>
      )}

      {abierto && estado === "ok" && (
        <div style={{ padding: "14px 16px" }}>
          {articulos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 28, color: P.txt3, fontFamily: "monospace", fontSize: "0.74rem" }}>
              No se encontraron artículos para esta búsqueda.
            </div>
          ) : (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                padding: "6px 10px", background: P.blueL, border: `1px solid ${P.border}`, borderRadius: 5,
              }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.62rem", color: P.blue }}>
                  {articulos.length} artículos encontrados
                  {leidosCnt > 0 && ` · ${leidosCnt} leídos`}
                  {califCnt > 0 && ` · ${califCnt} calificados (★ ${promCalif})`}
                </span>
              </div>
              {articulos.map(art => (
                <FichaArticulo key={art.id} articulo={art}
                  onActualizar={upd => onActualizarArticulo(art.id, upd)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function ArticulosBuscador({ authUser }) {
  const [sets, setSets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SK_SETS) || "[]"); } catch { return []; }
  });

  const [favoritos, setFavoritos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SK_FAVS) || "[]"); } catch { return []; }
  });

  const [equiposMios, setEquiposMios]         = useState([]);
  const [misCompartidos, setMisCompartidos]   = useState([]);
  const [compartidosConmigo, setCompartidosConmigo] = useState([]);

  useEffect(() => {
    if (!sbReady() || !authUser) return;
    Promise.all([dbLoadEquipos(), dbLoadFavoritosCompartidos()])
      .then(([eqs, compartidos]) => {
        const mios = eqs.filter(e => e.owner === authUser || (e.miembros || []).includes(authUser));
        setEquiposMios(mios);
        setMisCompartidos(compartidos.filter(c => c.compartido_por === authUser));
        const misIds = new Set(mios.map(e => e.id));
        const deEllos = compartidos.filter(c => c.compartido_por !== authUser && misIds.has(c.equipo_id));
        // deduplicar por articulo_id
        const seen = new Set();
        setCompartidosConmigo(deEllos.filter(c => seen.has(c.articulo_id) ? false : seen.add(c.articulo_id)));
      })
      .catch(() => {});
  }, [authUser]);

  // Cargar desde Supabase al montar (si está configurado)
  useEffect(() => {
    if (!sbReady()) return;
    dbLoadSets()
      .then(remote => {
        setSets(remote);
        try { localStorage.setItem(SK_SETS, JSON.stringify(remote)); } catch {}
      })
      .catch(() => {});
  }, []);

  // Escuchar evento de sincronización forzada desde DBConfig
  useEffect(() => {
    const handler = () => {
      sets.forEach(s => dbUpsertSet(s).catch(() => {}));
    };
    window.addEventListener("fitofichas:sync-sets", handler);
    return () => window.removeEventListener("fitofichas:sync-sets", handler);
  }, [sets]);

  const [keywords, setKeywords] = useState([]);
  const [desdeF, setDesdeF]     = useState("");
  const [hastaF, setHastaF]     = useState("");
  const [maxR, setMaxR]         = useState(10);
  const [fuente, setFuente]     = useState("openalex");
  const [idioma, setIdioma]     = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [formErr, setFormErr]   = useState("");
  const [progreso, setProgreso] = useState(null);

  const guardarSets = (nuevos, changed = null, deletedId = null) => {
    setSets(nuevos);
    try { localStorage.setItem(SK_SETS, JSON.stringify(nuevos)); } catch {}
    if (sbReady()) {
      if (changed)   dbUpsertSet(changed).catch(() => {});
      if (deletedId) dbDeleteSet(deletedId).catch(() => {});
    }
  };

  const guardarFavoritos = (nuevos) => {
    setFavoritos(nuevos);
    try { localStorage.setItem(SK_FAVS, JSON.stringify(nuevos)); } catch {}
  };

  const handleBuscar = async () => {
    if (keywords.length === 0) { setFormErr("Ingrese al menos una palabra clave."); return; }
    setFormErr(""); setBuscando(true);
    setProgreso({ cargado: 0, total: maxR });

    const nuevoSet = {
      id: genId(),
      creadoEl: new Date().toISOString(),
      params: { keywords: [...keywords], dateFrom: desdeF, dateTo: hastaF, maxResults: maxR, fuente, idioma },
      articulos: [],
      estado: "cargando",
    };

    const listaTmp = [nuevoSet, ...sets];
    guardarSets(listaTmp);

    try {
      const crudos = await FUENTES[fuente].fn(
        keywords, desdeF, hastaF, maxR,
        (c, t) => setProgreso({ cargado: c, total: t }),
        idioma,
      );
      // Intersección: el artículo debe contener TODAS las palabras clave
      // Filtrar si hay múltiples keywords o alguno es una frase (contiene espacios)
      const necesitaFiltro = keywords.length > 1 || keywords.some(kw => kw.includes(" "));
      const articulos = necesitaFiltro
        ? crudos.filter(a => {
            // Priorizar título; sumar descripción si está disponible
            const texto = `${a.titulo} ${a.descripcion || ""}`.toLowerCase();
            return keywords.every(kw => cumplePalabras(texto, kw));
          })
        : crudos;
      const setFinal = { ...nuevoSet, articulos, estado: "ok" };
      guardarSets(listaTmp.map(s => s.id === nuevoSet.id ? setFinal : s), setFinal);
    } catch (e) {
      const setErr = { ...nuevoSet, estado: "error", error: e.message };
      guardarSets(listaTmp.map(s => s.id === nuevoSet.id ? setErr : s), setErr);
      setFormErr(e.message);
    } finally {
      setBuscando(false); setProgreso(null);
    }
  };

  const actualizarArticulo = (setId, artId, upd) => {
    const setActualizado = sets.find(s => s.id === setId);
    if (!setActualizado) return;
    const artBase = setActualizado.articulos.find(a => a.id === artId);

    // Sync favorito toggle with independent favorites list
    if ('favorito' in upd) {
      if (upd.favorito && artBase && !favoritos.find(f => f.id === artId)) {
        guardarFavoritos([{ ...artBase, favorito: true, _setId: setId, _keywords: setActualizado.params.keywords }, ...favoritos]);
      } else if (!upd.favorito) {
        guardarFavoritos(favoritos.filter(f => f.id !== artId));
      }
    }

    const nuevo = { ...setActualizado, articulos: setActualizado.articulos.map(a => a.id === artId ? { ...a, ...upd } : a) };
    guardarSets(sets.map(s => s.id === setId ? nuevo : s), nuevo);
  };

  // Updates originating from the Favorites panel
  const actualizarFavorito = (artId, upd) => {
    if ('favorito' in upd && !upd.favorito) {
      // Unflagging: remove from favorites and sync to set if still alive
      const fav = favoritos.find(f => f.id === artId);
      guardarFavoritos(favoritos.filter(f => f.id !== artId));
      if (fav?._setId) {
        const s = sets.find(s => s.id === fav._setId);
        if (s) {
          const nuevo = { ...s, articulos: s.articulos.map(a => a.id === artId ? { ...a, favorito: false } : a) };
          guardarSets(sets.map(x => x.id === fav._setId ? nuevo : x), nuevo);
        }
      }
    } else {
      // Other updates (leido, calificacion, textoCompleto): update favorite copy + sync to set
      guardarFavoritos(favoritos.map(f => f.id === artId ? { ...f, ...upd } : f));
      const fav = favoritos.find(f => f.id === artId);
      if (fav?._setId) {
        const s = sets.find(s => s.id === fav._setId);
        if (s) {
          const nuevo = { ...s, articulos: s.articulos.map(a => a.id === artId ? { ...a, ...upd } : a) };
          guardarSets(sets.map(x => x.id === fav._setId ? nuevo : x), nuevo);
        }
      }
    }
  };

  const compartirConEquipo = async (articulo, equipoId) => {
    const record = {
      id: genId(), articulo_id: articulo.id, articulo,
      compartido_por: authUser, equipo_id: equipoId,
      compartido_el: new Date().toISOString(),
    };
    setMisCompartidos(prev => [...prev.filter(c => !(c.articulo_id === articulo.id && c.equipo_id === equipoId)), record]);
    if (sbReady()) dbUpsertFavoritoCompartido(record).catch(() => {});
  };

  const descompartirDeEquipo = async (articuloId, equipoId) => {
    setMisCompartidos(prev => prev.filter(c => !(c.articulo_id === articuloId && c.equipo_id === equipoId)));
    if (sbReady()) dbDeleteFavoritoCompartido(articuloId, equipoId).catch(() => {});
  };

  const eliminarSet = setId => guardarSets(sets.filter(s => s.id !== setId), null, setId);

  const BTN = { fontFamily: "inherit", cursor: "pointer", border: "none", borderRadius: 6, fontWeight: 600, transition: "all .12s" };
  const totalArt = sets.reduce((n, s) => n + (s.articulos?.length || 0), 0);

  return (
    <div>
      {/* ─ Formulario de búsqueda ─ */}
      <div style={{
        background: "#fff", border: `1px solid ${P.border}`,
        borderRadius: 10, marginBottom: 20, overflow: "hidden",
        boxShadow: "0 2px 10px rgba(7,25,58,.06)",
      }}>
        {/* Header */}
        <div style={{ background: P.navy, padding: "12px 16px" }}>
          <div style={{ fontFamily: "Georgia, serif", color: "#fff", fontSize: "1rem" }}>
            🔍 Búsqueda de Artículos
          </div>
          <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#7090b0", marginTop: 1 }}>
            Artículos de interés agronómico y fitosanitario · Sin configuración requerida
          </div>
        </div>

        <div style={{ padding: "16px 18px" }}>

          {/* Fuente de búsqueda */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
              Fuente de búsqueda
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(FUENTES).map(([key, f]) => (
                <button key={key} onClick={() => setFuente(key)} style={{
                  ...BTN,
                  background: fuente === key ? P.navy : "#fff",
                  border: `1.5px solid ${fuente === key ? P.navy : P.border2}`,
                  color: fuente === key ? "#fff" : P.txt2,
                  padding: "7px 14px", fontSize: "0.74rem",
                  textAlign: "left",
                }}>
                  <div style={{ fontWeight: 700 }}>{f.label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "0.58rem", opacity: 0.7, marginTop: 1 }}>{f.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 7, padding: "5px 10px", background: P.accentL, border: `1px solid #9fe1cb`, borderRadius: 5 }}>
              <span style={{ fontFamily: "monospace", fontSize: "0.64rem", color: "#0f6e56" }}>
                ✓ Completamente gratuito · Sin registro · Sin API Key
              </span>
            </div>
          </div>

          {/* Idioma */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
              Idioma del artículo
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { val: null, icon: null,   text: "Todos los idiomas" },
                { val: "es", icon: "https://flagcdn.com/20x15/es.png", text: "Español" },
                { val: "en", icon: "https://flagcdn.com/20x15/gb.png", text: "Inglés"  },
                { val: "fr", icon: "https://flagcdn.com/20x15/fr.png", text: "Français" },
              ].map(({ val, icon, text }) => (
                <button key={String(val)} onClick={() => setIdioma(val)} style={{
                  ...BTN,
                  background: idioma === val ? P.navy : "#fff",
                  border: `1.5px solid ${idioma === val ? P.navy : P.border2}`,
                  color: idioma === val ? "#fff" : P.txt2,
                  padding: "7px 14px", fontSize: "0.8rem",
                  display: "flex", alignItems: "center", gap: 7,
                }}>
                  {icon
                    ? <img src={icon} alt={text} style={{ width: 20, height: 15, borderRadius: 2, flexShrink: 0 }} />
                    : <span style={{ fontSize: "0.9rem" }}>🌐</span>
                  }
                  {text}
                </button>
              ))}
            </div>
            {idioma && fuente === "crossref" && (
              <div style={{ marginTop: 6, padding: "4px 9px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4 }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: "#92400e" }}>
                  ⚠ CrossRef no soporta filtro de idioma nativo · se aplica detección automática sobre título y resumen
                </span>
              </div>
            )}
          </div>

          {/* Palabras clave */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>
              Palabras clave
            </div>
            <PalabrasInput valor={keywords} onChange={setKeywords} />
          </div>

          {/* Fechas + cantidad */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Desde</div>
              <input type="date" value={desdeF} onChange={e => setDesdeF(e.target.value)}
                style={{ width: "100%", background: "#fff", border: `1px solid ${P.border2}`, borderRadius: 5, padding: "8px 10px", color: P.txt, fontFamily: "monospace", fontSize: "0.78rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Hasta</div>
              <input type="date" value={hastaF} onChange={e => setHastaF(e.target.value)}
                style={{ width: "100%", background: "#fff", border: `1px solid ${P.border2}`, borderRadius: 5, padding: "8px 10px", color: P.txt, fontFamily: "monospace", fontSize: "0.78rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Máx. artículos</div>
              <select value={maxR} onChange={e => setMaxR(Number(e.target.value))} style={{
                background: "#fff", border: `1px solid ${P.border2}`, borderRadius: 5,
                padding: "8px 12px", color: P.txt, fontFamily: "monospace", fontSize: "0.78rem",
                outline: "none", cursor: "pointer",
              }}>
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {formErr && (
            <div style={{ padding: "7px 12px", background: P.redL, border: `1px solid #e0a0a0`, borderRadius: 5, fontFamily: "monospace", fontSize: "0.72rem", color: P.red, marginBottom: 12 }}>
              ⚠ {formErr}
            </div>
          )}

          {/* Botones */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={handleBuscar} disabled={buscando} style={{
              ...BTN,
              background: buscando ? P.txt3 : P.blue, color: "#fff",
              padding: "10px 22px", fontSize: "0.82rem",
              cursor: buscando ? "wait" : "pointer", opacity: buscando ? 0.75 : 1,
            }}>
              {buscando ? `⏳ Buscando… (${progreso?.cargado || 0} / ${maxR})` : "🔍 Buscar artículos"}
            </button>
            {(keywords.length > 0 || desdeF || hastaF) && !buscando && (
              <button onClick={() => { setKeywords([]); setDesdeF(""); setHastaF(""); setIdioma(null); setFormErr(""); }}
                style={{ ...BTN, background: "transparent", border: `1px solid ${P.border2}`, color: P.txt3, padding: "8px 14px", fontSize: "0.74rem" }}>
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─ Favoritos ─ */}
      <SeccionFavoritos
        favoritos={favoritos}
        equiposMios={equiposMios}
        misCompartidos={misCompartidos}
        compartidosConmigo={compartidosConmigo}
        onActualizar={actualizarFavorito}
        onCompartir={compartirConEquipo}
        onDescompartir={descompartirDeEquipo}
      />

      {/* ─ Lista de sets ─ */}
      {sets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "52px 20px" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>📰</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", color: P.navy, marginBottom: 6 }}>
            Sin búsquedas realizadas
          </div>
          <div style={{ fontSize: "0.8rem", color: P.txt3 }}>
            Ingrese palabras clave y haga clic en Buscar artículos.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: "1rem", color: P.navy, fontWeight: 600 }}>
                Sets de búsqueda
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "0.62rem", color: P.txt3, marginTop: 1 }}>
                {sets.length} set{sets.length !== 1 ? "s" : ""} · {totalArt} artículo{totalArt !== 1 ? "s" : ""} en total
              </div>
            </div>
            <button
              onClick={() => { if (window.confirm(`¿Eliminar los ${sets.length} sets? (${totalArt} artículos)`)) { guardarSets([]); if (sbReady()) dbDeleteAllSets().catch(() => {}); } }}
              style={{ ...BTN, background: "transparent", border: `1px solid ${P.border2}`, color: P.txt3, padding: "5px 12px", fontSize: "0.72rem" }}>
              🗑 Limpiar todo
            </button>
          </div>
          {sets.map(set => (
            <SetBusqueda key={set.id} set={set}
              onEliminar={() => eliminarSet(set.id)}
              onActualizarArticulo={(artId, upd) => actualizarArticulo(set.id, artId, upd)} />
          ))}
        </div>
      )}
    </div>
  );
}
