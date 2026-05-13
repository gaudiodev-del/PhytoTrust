import { useState, useEffect, Component } from "react";
import { TIPOS, IMPACT_CATS, P } from "./constants";
import { impColor } from "./utils/impColor";
import { exportPDF } from "./utils/exportPDF";
import { parseJSON } from "./utils/parseJSON";
import WorldMap from "./components/WorldMap";
import ImpactChart from "./components/ImpactChart";
import { FICHAS_DEFAULT } from "./data/fichasDefault";
import ArticulosBuscador from "./components/ArticulosBuscador";
import PlagaMap from "./components/PlagaMap";
import EquiposManager from "./components/EquiposManager";
import RolesManager from "./components/RolesManager";
import DBConfig from "./components/DBConfig";
import LoginPage from "./components/LoginPage";
import { sbReady, sbClient, sbSignOut, toDisplay } from "./lib/supabase";
import { dbLoadFichas, dbUpsertFicha, dbDeleteFicha, dbUpsertPerfil, dbGetPerfilRol } from "./services/db";

class ModalErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position:"fixed",inset:0,background:"rgba(7,25,58,.75)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
          <div style={{ background:"#fff",borderRadius:10,padding:24,maxWidth:500,width:"100%" }}>
            <div style={{ color:"#a32d2d",fontWeight:700,marginBottom:8 }}>Error al mostrar la ficha</div>
            <pre style={{ fontSize:"0.72rem",color:"#333",whiteSpace:"pre-wrap",wordBreak:"break-word",marginBottom:16,maxHeight:200,overflow:"auto",background:"#f5f5f5",padding:8,borderRadius:4 }}>{this.state.error?.message}{"\n"}{this.state.error?.stack}</pre>
            <button onClick={this.props.onClose} style={{ background:"#185fa5",color:"#fff",border:"none",borderRadius:5,padding:"8px 18px",cursor:"pointer",fontWeight:600 }}>Cerrar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══ APP ══════════════════════════════════════════════════════════════════════
export default function App() {
  const [authUser, setAuthUser] = useState(() => sessionStorage.getItem("ff_auth") || null);
  const [fichas, setFichas] = useState([]);
  const [tab, setTab] = useState("fichas");
  const [jsonTxt, setJsonTxt] = useState("");
  const [jsonErr, setJsonErr] = useState("");
  const [ok, setOk] = useState(false);
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [filterTipo, setFilterTipo] = useState(null);
  const [filterSinavimo, setFilterSinavimo] = useState(null);
  const [sortKey, setSortKey] = useState("alpha_asc");
  const [dbOpen, setDbOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authRole, setAuthRole] = useState('user');

  // ── Auth: verifica sesión Supabase al arrancar ────────────────────────────
  useEffect(() => {
    const sb = sbClient();
    if (!sb) { setAuthChecked(true); return; }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = toDisplay(session.user.email);
        setAuthUser(u);
        if (sbReady()) {
          dbUpsertPerfil(u).catch(() => {});
          dbGetPerfilRol(u).then(setAuthRole).catch(() => {});
        }
      }
      setAuthChecked(true);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      if (session?.user) {
        const u = toDisplay(session.user.email);
        setAuthUser(u);
        if (sbReady()) dbGetPerfilRol(u).then(setAuthRole).catch(() => {});
      } else {
        setAuthUser(null);
        setAuthRole('user');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Fichas: carga solo cuando el usuario está autenticado ─────────────────
  useEffect(() => {
    if (!authUser) return;
    let initial = FICHAS_DEFAULT;
    try {
      const s = localStorage.getItem("ffd");
      if (s) {
        const stored = JSON.parse(s);
        const storedIds = new Set(stored.map(f => f.id));
        const defaults = FICHAS_DEFAULT.filter(f => !storedIds.has(f.id));
        initial = [...stored, ...defaults];
      }
    } catch {}
    setFichas(initial);

    if (sbReady()) {
      dbLoadFichas()
        .then(remote => {
          const remoteIds = new Set(remote.map(f => String(f.id)));
          const extras = FICHAS_DEFAULT.filter(f => !remoteIds.has(String(f.id)));
          setFichas([...remote, ...extras]);
          try { localStorage.setItem("ffd", JSON.stringify(remote)); } catch {}
        })
        .catch(() => {});
    }
  }, [authUser]);

  // Pantalla de carga mientras se verifica la sesión
  if (!authChecked) return (
    <div style={{ minHeight:"100vh", background:P.navy3, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:40, height:40, border:"3px solid rgba(255,255,255,.15)", borderTopColor:P.blue, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <div style={{ fontFamily:"monospace", fontSize:"0.65rem", color:"#7090b0", textTransform:"uppercase", letterSpacing:".1em" }}>Verificando sesión…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // Guard: si no hay sesión activa, mostrar login
  if (!authUser) return <LoginPage onLogin={u => setAuthUser(u)} />;

  const persist = (arr, changed = null, deletedId = null) => {
    setFichas(arr);
    try { localStorage.setItem("ffd", JSON.stringify(arr)); } catch {}
    if (sbReady()) {
      if (changed)   dbUpsertFicha(changed).catch(() => {});
      if (deletedId) dbDeleteFicha(deletedId).catch(() => {});
    }
  };

  const loadJSON = () => {
    setJsonErr(""); setOk(false);
    try {
      const ficha = parseJSON(jsonTxt);
      ficha.id = Date.now().toString();
      ficha.createdAt = new Date().toISOString();
      persist([ficha, ...fichas.filter(f => f.nombre_cientifico !== ficha.nombre_cientifico)], ficha);
      setOk(true);
      setTimeout(() => { setJsonTxt(""); setOk(false); setTab("fichas"); setView(ficha.id); }, 800);
    } catch (e) { setJsonErr(e.message); }
  };

  const get = id => fichas.find(f => f.id === id);
  const doDelete = id => { persist(fichas.filter(f => f.id !== id), null, id); setDel(null); setView(null); };
  const doSave = () => {
    const idx = fichas.findIndex(f => f.id === edit.id); if (idx === -1) return;
    const arr = [...fichas]; arr[idx] = edit; persist(arr, edit); setView(edit.id); setEdit(null);
  };
  const upd = (k, v) => setEdit(p => ({ ...p, [k]: v }));
  const updT = (k, v) => setEdit(p => ({ ...p, taxonomia: { ...p.taxonomia, [k]: v } }));
  const types = new Set(fichas.map(f => f.tipoplaga).filter(Boolean));
  const sinavimoVals = new Set(fichas.map(f => f.condicion_sinavimo || "Desconocida"));
  const avgImpact = f => f.impacto_comercial ? IMPACT_CATS.reduce((s, c) => s + (f.impacto_comercial[c.key] || 0), 0) / IMPACT_CATS.length : -1;
  const fichasFiltradas = fichas
    .filter(f =>
      (!filterTipo || f.tipoplaga === filterTipo) &&
      (!filterSinavimo || (f.condicion_sinavimo || "Desconocida") === filterSinavimo)
    )
    .sort((a, b) => {
      if (sortKey === "alpha_asc") return (a.nombre_cientifico || "").localeCompare(b.nombre_cientifico || "");
      if (sortKey === "alpha_desc") return (b.nombre_cientifico || "").localeCompare(a.nombre_cientifico || "");
      if (sortKey === "imp_asc") return avgImpact(a) - avgImpact(b);
      if (sortKey === "imp_desc") return avgImpact(b) - avgImpact(a);
      return 0;
    });

  // Estilos
  const BTN = { fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: "0.74rem", fontWeight: 600, padding: "8px 16px", borderRadius: 5, cursor: "pointer", border: "1px solid", display: "inline-flex", alignItems: "center", gap: 5, transition: "all .12s" };
  const BP = { ...BTN, background: P.blue, borderColor: P.blue, color: "#fff" };
  const BS = { ...BTN, background: "transparent", borderColor: P.border2, color: P.txt2 };
  const BW = { ...BTN, background: P.goldL, borderColor: "#e0b870", color: P.gold };
  const BD = { ...BTN, background: P.redL, borderColor: "#e0a0a0", color: P.red, marginLeft: "auto" };
  const BSM = { ...BTN, fontSize: "0.66rem", fontWeight: 500, padding: "4px 10px", borderRadius: 4 };
  const OV = { position: "fixed", inset: 0, background: "rgba(7,25,58,.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(3px)" };
  const MOD = { background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 10, width: "100%", maxWidth: 820, maxHeight: "93vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(7,25,58,.25)" };
  const MHDR = { position: "sticky", top: 0, background: P.navy, padding: "15px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, zIndex: 10, borderRadius: "10px 10px 0 0" };
  const MACT = { padding: "14px 20px 20px", display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${P.border}`, background: P.bg };
  const IN = { width: "100%", background: P.bgW, border: `1px solid ${P.border2}`, borderRadius: 5, padding: "8px 11px", color: P.txt, fontFamily: "inherit", fontSize: "0.78rem", outline: "none" };
  const SL = lbl => <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".09em", display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>{lbl}<div style={{ flex: 1, height: 1, background: P.border }} /></div>;
  const FV = ({ children }) => <div style={{ background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 6, padding: "10px 13px", fontSize: "0.8rem", color: P.txt2, lineHeight: 1.6 }}>{children}</div>;
  const FLD = ({ label, children }) => <div style={{ marginBottom: 16 }}>{SL(label)}<FV>{children}</FV></div>;

  const tipoBg = t => {
    if (!t) return { bg: P.badge, color: P.blue };
    if (t.includes("Hongo") || t.includes("Pseudo")) return { bg: "#e1f5ee", color: "#0f6e56" };
    if (t.includes("Insecto")) return { bg: "#faeeda", color: "#854f0b" };
    if (t.includes("Bacteria")) return { bg: "#fcebeb", color: P.red };
    if (t.includes("Virus")) return { bg: "#fbeaf0", color: "#993556" };
    if (t.includes("Nemát")) return { bg: "#eeedfe", color: "#534ab7" };
    if (t.includes("Ácaro")) return { bg: "#faeeda", color: "#633806" };
    return { bg: P.badge, color: P.blue };
  };

  const CloseBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
  );

  const ViewModal = () => {
    const f = get(view); if (!f) return null;
    const taxa = f.taxonomia || {};
    const tb = tipoBg(f.tipoplaga);
    const presCount = (f.presencia_mundial || []).filter(p => p.estado === "presente").length;

    // Normalizar fuentes: soporta tanto strings como objetos
    const fuentesNorm = (f.fuentes || []).map((src, i) =>
      typeof src === "string"
        ? { id: i + 1, referencia: src, url: null, tipo: null }
        : { id: src.id ?? i + 1, referencia: src.referencia || "", url: src.url || null, tipo: src.tipo || null }
    );

    const TIPO_BADGE = {
      base_datos: { bg: P.blueL,   color: P.blue,   lbl: "Base de datos" },
      articulo:   { bg: P.accentL, color: P.accent,  lbl: "Artículo"      },
      informe:    { bg: P.goldL,   color: P.gold,    lbl: "Informe"       },
      libro:      { bg: "#f0eaf8", color: "#6b3fa0", lbl: "Libro"         },
    };

    // Badge numérico clicable que lleva a la URL de la fuente
    const RefBadge = ({ id }) => {
      const src = fuentesNorm.find(s => s.id === id);
      if (!src) return null;
      const tc = TIPO_BADGE[src.tipo] || { bg: P.bg, color: P.txt3 };
      const Tag = src.url ? "a" : "span";
      return (
        <Tag href={src.url || undefined} target={src.url ? "_blank" : undefined}
          rel="noopener noreferrer" title={src.referencia}
          style={{
            background: tc.bg, color: tc.color, border: `1px solid ${tc.color}50`,
            borderRadius: 3, fontSize: "0.58rem", fontFamily: "monospace",
            padding: "1px 5px", fontWeight: 700, textDecoration: "none",
            cursor: src.url ? "pointer" : "default", display: "inline-block",
          }}>
          {id}
        </Tag>
      );
    };

    // Encabezado de sección con badges de referencias opcionales
    const SLR = (lbl, refs) => (
      <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".09em", display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        {lbl}
        {Array.isArray(refs) && refs.length > 0 && (
          <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
            {refs.map(id => <RefBadge key={id} id={id} />)}
          </span>
        )}
        <div style={{ flex: 1, height: 1, background: P.border }} />
      </div>
    );

    // Campo con label+refs y contenido
    const FLDR = (lbl, refs, children) => (
      <div style={{ marginBottom: 16 }}>{SLR(lbl, refs)}<FV>{children}</FV></div>
    );

    return (
      <div style={OV} onClick={e => e.target === e.currentTarget && setView(null)}>
        <div style={MOD}>
          <div style={MHDR}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, background: "rgba(255,255,255,.15)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🌿</div>
                <span style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#aac4e0", letterSpacing: ".1em", textTransform: "uppercase" }}>Ficha Fitosanitaria · SENASA · FitoFichas</span>
              </div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "1.5rem", fontStyle: "italic", color: "#fff", lineHeight: 1.2, marginBottom: 4 }}>{f.nombre_cientifico}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {f.nombre_vulgar && <span style={{ fontSize: "0.78rem", color: "#aac4e0" }}>▸ {f.nombre_vulgar}</span>}
                {f.tipoplaga && <span style={{ background: tb.bg, color: tb.color, fontFamily: "monospace", fontSize: "0.6rem", padding: "2px 9px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase" }}>{f.tipoplaga}</span>}
              </div>
            </div>
            <CloseBtn onClick={() => setView(null)} />
          </div>
          <div style={{ background: P.navy2, padding: "8px 20px", display: "flex", gap: 20, borderBottom: `1px solid ${P.blue}40` }}>
            {[["Orden", taxa.orden || "—"], ["Familia", taxa.familia || "—"], ["Presencia", presCount ? presCount + " países" : "—"], ["Fuentes", fuentesNorm.length + " ref."]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontFamily: "monospace", fontSize: "0.55rem", color: "#7090b0", textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</div>
                <div style={{ fontSize: "0.78rem", color: "#aac4e0", fontStyle: k === "Familia" ? "italic" : "normal" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "18px 20px", background: P.bg }}>
            {f.sinonimias && <FLD label="Sinonimias"><span style={{ fontFamily: "monospace", fontSize: "0.74rem", fontStyle: "italic" }}>{f.sinonimias}</span></FLD>}
            {Object.values(taxa).some(Boolean) && (
              <div style={{ marginBottom: 16 }}>{SL("Árbol Taxonómico")}
                <FV>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "4px 16px" }}>
                    {[["Reino", taxa.reino], ["Filo / División", taxa.filo], ["Clase", taxa.clase], ["Orden", taxa.orden], ["Familia", taxa.familia], ["Género", taxa.genero], ["Especie", taxa.especie]].filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0", borderBottom: `1px solid ${P.border}` }}>
                        <span style={{ fontFamily: "monospace", fontSize: "0.58rem", color: P.blue, textTransform: "uppercase", width: 72, flexShrink: 0 }}>{k}</span>
                        <span style={{ fontSize: "0.8rem", color: ["Género", "Especie"].includes(k) ? P.navy : P.txt2, fontStyle: ["Género", "Especie"].includes(k) ? "italic" : "normal", fontWeight: ["Género", "Especie"].includes(k) ? 600 : 400 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </FV>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>{SLR("Condición Oficial (Sinavimo)", f.condicion_sinavimo_refs)}
              <FV>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: f.condicion_sinavimo && f.condicion_sinavimo !== "Desconocida" ? P.navy : P.txt3, fontWeight: f.condicion_sinavimo && f.condicion_sinavimo !== "Desconocida" ? 600 : 400 }}>
                    {f.condicion_sinavimo || "Desconocida"}
                  </span>
                  <a href="https://www.sinavimo.gov.ar" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textDecoration: "none", border: `1px solid ${P.border2}`, borderRadius: 3, padding: "1px 6px" }}>↗ SINAVIMO</a>
                </div>
              </FV>
            </div>
            {f.descripcion_biologica && FLDR("Descripción Biológica", f.descripcion_biologica_refs, f.descripcion_biologica)}
            {f.signos_sintomas && FLDR("Signos, Síntomas y Daños", f.signos_sintomas_refs, f.signos_sintomas)}
            {f.condiciones_predisponentes && FLDR("Condiciones Predisponentes", f.condiciones_predisponentes_refs, f.condiciones_predisponentes)}
            {f.presencia_mundial?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {SLR(`Distribución Mundial · ${presCount} países con presencia confirmada`, f.presencia_mundial_refs)}
                <WorldMap presencia={f.presencia_mundial} />
              </div>
            )}
            {f.impacto_comercial && (
              <div style={{ marginBottom: 16 }}>
                {SLR("Impacto Comercial para Argentina", f.impacto_comercial_refs)}
                <ImpactChart impacto={f.impacto_comercial} />
              </div>
            )}
            {fuentesNorm.length > 0 && (
              <div style={{ marginBottom: 16 }}>{SL("Fuentes de Información")}
                <FV>
                  {fuentesNorm.map(src => {
                    const tc = TIPO_BADGE[src.tipo];
                    return (
                      <div key={src.id} style={{ display: "flex", gap: 10, marginBottom: 8, lineHeight: 1.5, padding: "6px 0", borderBottom: `1px solid ${P.border}`, alignItems: "flex-start" }}>
                        <span style={{ fontFamily: "monospace", color: P.blue, fontSize: "0.66rem", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>[{src.id}]</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {src.url
                            ? <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.76rem", color: P.blue, textDecoration: "none", lineHeight: 1.5, wordBreak: "break-word" }}
                                onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                                onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                                {src.referencia} ↗
                              </a>
                            : <span style={{ fontSize: "0.76rem", color: P.txt2 }}>{src.referencia}</span>
                          }
                          {tc && (
                            <span style={{ display: "inline-block", marginLeft: 8, background: tc.bg, color: tc.color, fontFamily: "monospace", fontSize: "0.55rem", padding: "1px 6px", borderRadius: 3, border: `1px solid ${tc.color}40`, fontWeight: 600, verticalAlign: "middle" }}>
                              {tc.lbl}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </FV>
              </div>
            )}
          </div>
          <div style={MACT}>
            <button style={BP} onClick={() => {
              const svgEl = document.querySelector(".fitofichas-worldmap-svg");
              const svgStr = svgEl ? new XMLSerializer().serializeToString(svgEl) : "";
              exportPDF(f, svgStr);
            }}>⬇ Exportar PDF</button>
            {authRole === 'admin' && <button style={BW} onClick={() => { setEdit({ ...f, taxonomia: { ...taxa } }); setView(null); }}>✏️ Editar ficha</button>}
            {authRole === 'admin' && <button style={BD} onClick={() => setDel(f.id)}>🗑 Eliminar</button>}
          </div>
        </div>
      </div>
    );
  };

  const EditModal = () => {
    if (!edit) return null;
    const taxa = edit.taxonomia || {};
    const TA = { ...IN, resize: "vertical" };
    const CC = ({ k, max }) => { const l = (edit[k] || "").length; return <div style={{ fontFamily: "monospace", fontSize: "0.58rem", textAlign: "right", marginTop: 2, color: l > max ? P.red : l > max * .85 ? P.gold : P.txt3 }}>{l}/{max}</div>; };
    return (
      <div style={OV} onClick={e => e.target === e.currentTarget && (setView(edit.id), setEdit(null))}>
        <div style={MOD}>
          <div style={MHDR}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#aac4e0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>Editar Ficha</div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "1.3rem", fontStyle: "italic", color: "#fff" }}>{edit.nombre_cientifico}</div>
            </div>
            <CloseBtn onClick={() => { setView(edit.id); setEdit(null); }} />
          </div>
          <div style={{ padding: "18px 20px", background: P.bg }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>{SL("Nombre Científico")}<input style={IN} value={edit.nombre_cientifico || ""} onChange={e => upd("nombre_cientifico", e.target.value)} /></div>
              <div>{SL("Tipo de Plaga")}<select style={{ ...IN, cursor: "pointer" }} value={edit.tipoplaga || ""} onChange={e => upd("tipoplaga", e.target.value)}><option value="">— Seleccionar —</option>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>{SL("Nombre Vulgar")}<input style={IN} value={edit.nombre_vulgar || ""} onChange={e => upd("nombre_vulgar", e.target.value)} /></div>
              <div>{SL("Sinonimias")}<input style={IN} value={edit.sinonimias || ""} onChange={e => upd("sinonimias", e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 12 }}>{SL("Árbol Taxonómico")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 6, padding: "10px 12px" }}>
                {["reino", "filo", "clase", "orden", "familia", "genero", "especie"].map(r => (
                  <div key={r}>
                    <div style={{ fontFamily: "monospace", fontSize: "0.55rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>{r.charAt(0).toUpperCase() + r.slice(1)}</div>
                    <input style={IN} value={taxa[r] || ""} onChange={e => updT(r, e.target.value)} placeholder={r} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>{SL("Condición Oficial (Sinavimo)")}<input style={IN} value={edit.condicion_sinavimo || ""} onChange={e => upd("condicion_sinavimo", e.target.value)} placeholder="Ej: Plaga Cuarentenaria Ausente / Plaga No Cuarentenaria Presente / Desconocida" /></div>
            {[["descripcion_biologica", "Descripción Biológica", 1000, 5], ["signos_sintomas", "Signos, Síntomas y Daños", 500, 3], ["condiciones_predisponentes", "Condiciones Predisponentes", 500, 3]].map(([k, lbl, max, rows]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                {SL(`${lbl} (máx ${max})`)}<textarea style={TA} rows={rows} value={edit[k] || ""} onChange={e => upd(k, e.target.value.slice(0, max))} /><CC k={k} max={max} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>{SL("Impacto Comercial (0–10)")}
              <div style={{ background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 6, padding: "12px 14px" }}>
                {IMPACT_CATS.map(({ key, label }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontFamily: "monospace", fontSize: "0.59rem", color: P.txt2, width: 160, flexShrink: 0 }}>{label}</div>
                    <input type="range" min={0} max={10} value={(edit.impacto_comercial || {})[key] || 0} onChange={e => upd("impacto_comercial", { ...edit.impacto_comercial, [key]: +e.target.value })} style={{ flex: 1, accentColor: P.blue }} />
                    <span style={{ fontFamily: "monospace", fontSize: "0.68rem", color: P.blue, width: 20, fontWeight: 700 }}>{(edit.impacto_comercial || {})[key] || 0}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>{SL("Descripción del impacto")}<textarea style={TA} rows={2} value={(edit.impacto_comercial || {}).descripcion || ""} onChange={e => upd("impacto_comercial", { ...edit.impacto_comercial, descripcion: e.target.value.slice(0, 250) })} /></div>
              </div>
            </div>
            <div>
              {SL("Fuentes (una por línea)")}
              <textarea style={TA} rows={4}
                value={(edit.fuentes || []).map(f => typeof f === "string" ? f : f.referencia || "").join("\n")}
                onChange={e => {
                  const lines = e.target.value.split("\n");
                  upd("fuentes", lines.map((line, i) => {
                    const orig = (edit.fuentes || [])[i];
                    return (orig && typeof orig === "object") ? { ...orig, referencia: line } : line;
                  }));
                }} />
              {(edit.fuentes || []).some(f => typeof f === "object" && f.url) && (
                <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.txt3, marginTop: 4 }}>
                  ℹ Las URLs y tipos de cada fuente se conservan al editar el texto.
                </div>
              )}
            </div>
          </div>
          <div style={MACT}><button style={BP} onClick={doSave}>💾 Guardar cambios</button><button style={BS} onClick={() => { setView(edit.id); setEdit(null); }}>Cancelar</button></div>
        </div>
      </div>
    );
  };

  const DelDialog = () => {
    const f = get(del); if (!f) return null;
    return (
      <div style={{ ...OV, zIndex: 200, background: "rgba(7,25,58,.88)" }}>
        <div style={{ background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 10, padding: 28, maxWidth: 360, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 10 }}>⚠️</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: "1.1rem", color: P.navy, marginBottom: 6 }}>Eliminar ficha</div>
          <div style={{ fontSize: "0.82rem", color: P.txt2, marginBottom: 20, lineHeight: 1.5 }}>¿Eliminar <em style={{ color: P.navy }}>{f.nombre_cientifico}</em>? No se puede deshacer.</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button style={BS} onClick={() => setDel(null)}>Cancelar</button>
            <button style={{ ...BTN, background: P.red, borderColor: P.red, color: "#fff" }} onClick={() => doDelete(del)}>Eliminar</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: P.bg, color: P.txt, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* HEADER */}
      <div style={{ background: P.navy3, borderBottom: `3px solid ${P.blue2}` }}>
        <div style={{ background: P.navy, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, background: "rgba(255,255,255,.12)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: "1px solid rgba(255,255,255,.15)" }}>🌿</div>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "0.55rem", color: "#7090b0", textTransform: "uppercase", letterSpacing: ".1em" }}>República Argentina · SENASA</div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "1.3rem", color: "#fff" }}>FitoFichas</div>
              <div style={{ fontFamily: "monospace", fontSize: "0.54rem", color: "#aac4e0", letterSpacing: ".06em" }}>Sistema Nacional de Fichas Fitosanitarias</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {[["Fichas", fichas.length], ["Tipos", types.size]].map(([l, n]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: "1.3rem", color: "#fff", fontWeight: 600, display: "block" }}>{n}</div>
                <div style={{ fontSize: "0.58rem", color: "#7090b0", textTransform: "uppercase", letterSpacing: ".07em" }}>{l}</div>
              </div>
            ))}
            <button onClick={() => setDbOpen(true)} title="Base de datos en la nube" style={{
              background: sbReady() ? "rgba(29,158,117,.25)" : "rgba(255,255,255,.08)",
              border: `1px solid ${sbReady() ? "rgba(29,158,117,.5)" : "rgba(255,255,255,.15)"}`,
              color: sbReady() ? "#7de8c8" : "#7090b0",
              borderRadius: 6, cursor: "pointer", padding: "6px 12px",
              fontFamily: "monospace", fontSize: "0.62rem", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 5, transition: "all .15s",
            }}>
              {sbReady() ? "🟢" : "☁"} {sbReady() ? "BD Conectada" : "Conectar BD"}
            </button>
            <div style={{ width:1, height:28, background:"rgba(255,255,255,.12)" }} />
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
              <div style={{ fontFamily:"monospace", fontSize:"0.55rem", color:"#7090b0", textTransform:"uppercase", letterSpacing:".07em" }}>usuario</div>
              <div style={{ fontFamily:"monospace", fontSize:"0.68rem", color:"#aac4e0", fontWeight:600 }}>{authUser}</div>
            </div>
            <button onClick={() => { sbSignOut(); setAuthUser(null); }} title="Cerrar sesión" style={{
              background:"rgba(163,45,45,.2)", border:"1px solid rgba(163,45,45,.4)",
              color:"#f0a0a0", borderRadius:6, cursor:"pointer", padding:"6px 11px",
              fontFamily:"monospace", fontSize:"0.6rem", fontWeight:600,
              display:"flex", alignItems:"center", gap:4, transition:"all .15s",
            }}>⏻ Salir</button>
          </div>
        </div>
        <div style={{ background: P.navy2, display: "flex", paddingLeft: 24 }}>
          {[["fichas", "📋 Fichas"], ["articulos", "🔍 Artículos"], ["plagamap", "🌍 PlagaMap"], ["equipos", "👥 Equipos"], ...(authRole === 'admin' ? [["roles", "👤 Roles"]] : [])].map(([key, lbl]) => (
            <button key={key} onClick={() => setTab(key)} style={{ fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, padding: "10px 18px", border: "none", borderBottom: `3px solid ${tab === key ? "#fff" : "transparent"}`, background: "transparent", color: tab === key ? "#fff" : "#7090b0", cursor: "pointer", transition: "all .12s" }}>{lbl}</button>
          ))}
        </div>
      </div>

      {tab === "plagamap" ? (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PlagaMap />
        </div>
      ) : (
      <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px" }}>

        {tab === "nueva" && authRole === 'admin' && (
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 12px rgba(7,25,58,.08)" }}>
              <div style={{ background: P.blueL, borderBottom: `1px solid ${P.border}`, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, background: P.blue, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15 }}>📥</div>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: P.navy }}>Importar ficha desde Claude</div>
                  <div style={{ fontSize: "0.72rem", color: P.txt2 }}>Pegue el JSON generado por Claude</div>
                </div>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <div style={{ width: 28, height: 28, background: P.navy, color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>1</div>
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: P.navy, marginBottom: 4 }}>Solicitar la ficha en el chat</div>
                    <div style={{ background: P.bg, border: `1px solid ${P.border}`, borderRadius: 6, padding: "10px 14px" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: P.txt3, marginBottom: 3, textTransform: "uppercase", letterSpacing: ".07em" }}>Ejemplo</div>
                      <div style={{ fontFamily: "monospace", fontSize: "0.88rem", color: P.navy }}>ficha <em style={{ color: P.blue }}>Phytophthora infestans</em></div>
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${P.border}`, marginBottom: 18 }} />
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 28, height: 28, background: P.navy, color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>2</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: P.navy, marginBottom: 6 }}>Pegar la respuesta JSON de Claude</div>
                    <textarea value={jsonTxt} onChange={e => { setJsonTxt(e.target.value); setJsonErr(""); setOk(false); }}
                      placeholder={"Pegue aquí el JSON de Claude...\n\n```json\n{\"nombre_cientifico\": \"...\", ...}\n```"}
                      style={{ width: "100%", background: P.bg, border: `1.5px solid ${jsonErr ? P.red : ok ? "#1d9e75" : P.border2}`, borderRadius: 6, padding: "10px 13px", color: P.txt, fontFamily: "monospace", fontSize: "0.74rem", outline: "none", resize: "vertical", height: 180, lineHeight: 1.5 }} />
                    {jsonErr && <div style={{ color: P.red, fontFamily: "monospace", fontSize: "0.74rem", marginTop: 6, padding: "6px 10px", background: P.redL, borderRadius: 5, border: `1px solid #e0a0a0` }}>⚠ {jsonErr}</div>}
                    {ok && <div style={{ color: "#0f6e56", fontFamily: "monospace", fontSize: "0.74rem", marginTop: 6, padding: "6px 10px", background: "#e1f5ee", borderRadius: 5, border: "1px solid #9fe1cb" }}>✓ Ficha cargada. Redirigiendo…</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button style={{ ...BP, fontSize: "0.8rem", padding: "9px 20px" }} onClick={loadJSON} disabled={!jsonTxt.trim() || ok}>✅ Cargar ficha</button>
                      <button style={{ ...BS, fontSize: "0.8rem" }} onClick={() => { setJsonTxt(""); setJsonErr(""); setOk(false); }}>Limpiar</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "fichas" && (
          fichas.length === 0 ? (
            <div style={{ textAlign: "center", padding: "70px 20px" }}>
              <div style={{ width: 64, height: 64, background: P.blueL, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>🔬</div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "1.2rem", color: P.navy, marginBottom: 6 }}>Sin fichas registradas</div>
              <div style={{ fontSize: "0.82rem", color: P.txt2, marginBottom: 6, lineHeight: 1.7 }}>
                Escriba en el chat: <code style={{ background: P.blueL, color: P.blue, padding: "2px 8px", borderRadius: 4, fontFamily: "monospace" }}>ficha Botrytis cinerea</code>
              </div>
              <div style={{ fontSize: "0.78rem", color: P.txt3, marginBottom: 24 }}>Luego pegue la respuesta en <strong style={{ color: P.navy }}>➕ Nueva Ficha</strong></div>
              {authRole === 'admin' && <button style={BP} onClick={() => setTab("nueva")}>➕ Nueva Ficha</button>}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "Georgia,serif", fontSize: "1.1rem", color: P.navy, fontWeight: 600 }}>Fichas registradas</div>
                  <div style={{ fontSize: "0.72rem", color: P.txt3, marginTop: 1 }}>Sistema Nacional de Vigilancia · FitoFichas</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontSize: "0.65rem", color: P.txt2, background: P.blueL, border: `1px solid ${P.border}`, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{fichasFiltradas.length}/{fichas.length} {fichas.length === 1 ? "ficha" : "fichas"}</span>
                  {authRole === 'admin' && <button style={{ ...BSM, ...BP }} onClick={() => setTab("nueva")}>➕ Nueva</button>}
                </div>
              </div>

              {/* Filtros */}
              <div style={{ background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 7 }}>Tipo de plaga</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button onClick={() => setFilterTipo(null)} style={{ fontFamily: "monospace", fontSize: "0.62rem", fontWeight: 600, padding: "3px 11px", borderRadius: 20, cursor: "pointer", border: `1px solid ${!filterTipo ? P.blue : P.border2}`, background: !filterTipo ? P.blue : "transparent", color: !filterTipo ? "#fff" : P.txt2, transition: "all .12s" }}>Todos</button>
                    {[...types].sort().map(t => {
                      const tb = tipoBg(t);
                      const active = filterTipo === t;
                      return <button key={t} onClick={() => setFilterTipo(active ? null : t)} style={{ fontFamily: "monospace", fontSize: "0.62rem", fontWeight: 600, padding: "3px 11px", borderRadius: 20, cursor: "pointer", border: `1px solid ${active ? tb.color : P.border2}`, background: active ? tb.color : "transparent", color: active ? "#fff" : P.txt2, transition: "all .12s" }}>{t}</button>;
                    })}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 10 }}>
                  <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 7 }}>Condición Sinavimo</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button onClick={() => setFilterSinavimo(null)} style={{ fontFamily: "monospace", fontSize: "0.62rem", fontWeight: 600, padding: "3px 11px", borderRadius: 20, cursor: "pointer", border: `1px solid ${!filterSinavimo ? P.blue : P.border2}`, background: !filterSinavimo ? P.blue : "transparent", color: !filterSinavimo ? "#fff" : P.txt2, transition: "all .12s" }}>Todas</button>
                    {[...sinavimoVals].sort().map(s => {
                      const active = filterSinavimo === s;
                      const isC = s.includes("Cuarentenaria");
                      const isP = s.includes("Presente");
                      const color = s === "Desconocida" ? P.txt3 : isC && isP ? P.red : isC ? "#d97706" : isP ? P.accent : P.txt2;
                      return <button key={s} onClick={() => setFilterSinavimo(active ? null : s)} style={{ fontFamily: "monospace", fontSize: "0.62rem", fontWeight: 600, padding: "3px 11px", borderRadius: 20, cursor: "pointer", border: `1px solid ${active ? color : P.border2}`, background: active ? color : "transparent", color: active ? "#fff" : P.txt2, transition: "all .12s" }}>{s}</button>;
                    })}
                  </div>
                </div>
              </div>

              {/* Ordenamiento */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.58rem", color: P.txt3, textTransform: "uppercase", letterSpacing: ".09em" }}>Ordenar por</span>
                {[
                  ["alpha_asc",  "A → Z"],
                  ["alpha_desc", "Z → A"],
                  ["imp_desc",   "Impacto ARG ↓"],
                  ["imp_asc",    "Impacto ARG ↑"],
                ].map(([key, lbl]) => (
                  <button key={key} onClick={() => setSortKey(key)} style={{ fontFamily: "monospace", fontSize: "0.62rem", fontWeight: 600, padding: "3px 12px", borderRadius: 20, cursor: "pointer", border: `1px solid ${sortKey === key ? P.navy : P.border2}`, background: sortKey === key ? P.navy : "transparent", color: sortKey === key ? "#fff" : P.txt2, transition: "all .12s" }}>{lbl}</button>
                ))}
              </div>

              {fichasFiltradas.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px", color: P.txt3, fontFamily: "monospace", fontSize: "0.78rem" }}>
                  Sin fichas para los filtros seleccionados.
                  <button onClick={() => { setFilterTipo(null); setFilterSinavimo(null); }} style={{ display: "block", margin: "10px auto 0", ...BS, fontSize: "0.7rem" }}>Limpiar filtros</button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14, paddingBottom: 44 }}>
                {fichasFiltradas.map((f, i) => {
                  const imp = f.impacto_comercial;
                  const overall = imp ? Math.round((IMPACT_CATS.reduce((s, c) => s + (imp[c.key] || 0), 0) / IMPACT_CATS.length) * 10) / 10 : null;
                  const oc = overall !== null ? impColor(overall) : null;
                  const tb = tipoBg(f.tipoplaga);
                  return (
                    <div key={f.id} style={{ background: P.bgW, border: `1px solid ${P.border}`, borderRadius: 9, overflow: "hidden", animation: "fadeUp .3s ease both", animationDelay: `${Math.min(i * .04, .2)}s`, boxShadow: "0 2px 8px rgba(7,25,58,.06)", transition: "box-shadow .15s,transform .15s" }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 18px rgba(7,25,58,.14)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(7,25,58,.06)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                      <div style={{ height: 4, background: `linear-gradient(90deg,${P.blue},${P.accent})` }} />
                      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${P.border}`, display: "flex", alignItems: "flex-start", gap: 8, justifyContent: "space-between" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: "0.97rem", color: P.navy, lineHeight: 1.28, marginBottom: 2 }}>{f.nombre_cientifico || "Sin nombre"}</div>
                          {f.nombre_vulgar && <div style={{ fontSize: "0.7rem", color: P.txt3 }}>▸ {f.nombre_vulgar}</div>}
                        </div>
                        {f.tipoplaga && <span style={{ background: tb.bg, color: tb.color, fontFamily: "monospace", fontSize: "0.54rem", padding: "2px 7px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${tb.color}30` }}>{f.tipoplaga}</span>}
                      </div>
                      <div style={{ padding: "10px 14px" }}>
                        {f.taxonomia && (f.taxonomia.orden || f.taxonomia.familia) && (
                          <div style={{ marginBottom: 8, padding: "5px 8px", background: P.bg, borderRadius: 5, border: `1px solid ${P.border}` }}>
                            <div style={{ fontFamily: "monospace", fontSize: "0.54rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 2 }}>Clasificación</div>
                            <div style={{ fontSize: "0.74rem", color: P.txt2 }}>{[f.taxonomia.orden, f.taxonomia.familia].filter(Boolean).join(" › ")}</div>
                          </div>
                        )}
                        {oc && (
                          <div style={{ padding: "6px 8px", background: oc.bg, borderRadius: 5, border: `1px solid ${oc.bar}40`, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: "monospace", fontSize: "0.54rem", color: oc.text, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 1 }}>📊 Impacto ARG</div>
                              <div style={{ fontFamily: "monospace", fontSize: "0.76rem", color: oc.text, fontWeight: 700 }}>{overall}/10 — {oc.label}</div>
                            </div>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: oc.bar, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "monospace", fontSize: "0.72rem", fontWeight: 700 }}>{overall}</div>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: "9px 14px", borderTop: `1px solid ${P.border}`, background: P.bg, display: "flex", gap: 5, flexWrap: "wrap" }}>
                        <button style={{ ...BSM, background: P.blue, borderColor: P.blue, color: "#fff", fontSize: "0.65rem", padding: "4px 10px" }} onClick={() => setView(f.id)}>👁 Ver ficha</button>
                        {authRole === 'admin' && <button style={{ ...BSM, ...BW, fontSize: "0.65rem", padding: "4px 10px" }} onClick={() => setEdit({ ...f, taxonomia: { ...f.taxonomia } })}>✏️ Editar</button>}
                        <button style={{ ...BSM, background: P.accentL, borderColor: "#9fe1cb", color: "#0f6e56", fontSize: "0.65rem", padding: "4px 10px" }} onClick={() => exportPDF(f)}>⬇ PDF</button>
                        {authRole === 'admin' && <button style={{ ...BSM, ...BD, fontSize: "0.65rem", padding: "4px 10px" }} onClick={() => setDel(f.id)}>🗑</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
        {tab === "articulos" && <ArticulosBuscador authUser={authUser} />}
        {tab === "equipos"   && <EquiposManager   authUser={authUser} authRole={authRole} />}
        {tab === "roles" && authRole === 'admin' && <RolesManager authUser={authUser} />}
      </div>
      </div>
      )}

      <ModalErrorBoundary onClose={() => setView(null)}>
        {view && !edit && <ViewModal />}
      </ModalErrorBoundary>
      {edit && <EditModal />}
      {del && <DelDialog />}
      {dbOpen && <DBConfig onClose={() => setDbOpen(false)} fichas={fichas} />}
    </div>
  );
}
