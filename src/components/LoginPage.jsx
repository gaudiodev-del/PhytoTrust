import { useState } from "react";
import { P } from "../constants";
import { sbSignIn, sbReady, sbSetConfig } from "../lib/supabase";

export default function LoginPage({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [showCfg, setShowCfg] = useState(false);
  const [cfgUrl, setCfgUrl] = useState("");
  const [cfgKey, setCfgKey] = useState("");
  const [cfgOk, setCfgOk] = useState(false);

  const saveConfig = () => {
    if (!cfgUrl.trim() || !cfgKey.trim()) return;
    sbSetConfig(cfgUrl.trim(), cfgKey.trim());
    setCfgOk(true);
    setTimeout(() => { setShowCfg(false); setCfgOk(false); }, 800);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!user.trim() || !pass) { setError("Completá usuario y contraseña."); return; }

    if (!sbReady()) {
      setError("Base de datos no configurada. Usá el botón ⚙ Configurar BD.");
      return;
    }

    setError(""); setLoading(true);
    const { error: authErr } = await sbSignIn(user.trim(), pass);

    if (authErr) {
      setError("Usuario o contraseña incorrectos.");
      setLoading(false);
    } else {
      onLogin(user.trim().toLowerCase());
    }
  };

  const IN = {
    width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
    borderRadius: 7, padding: "11px 14px", color: "#fff", fontFamily: "inherit",
    fontSize: "0.9rem", outline: "none", boxSizing: "border-box", transition: "border-color .15s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(145deg, ${P.navy3} 0%, #0a2040 40%, #0d3a6e 100%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: "'Inter','Segoe UI',sans-serif", position: "relative", overflow: "hidden",
    }}>

      {/* Círculos decorativos */}
      <div style={{ position:"absolute", top:-120, right:-120, width:400, height:400, borderRadius:"50%", background:"rgba(20,114,196,.12)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:-80, left:-80, width:300, height:300, borderRadius:"50%", background:"rgba(29,158,117,.10)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", top:"40%", left:"15%", width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,.03)", pointerEvents:"none" }} />

      {/* Tarjeta */}
      <div style={{
        background: "rgba(255,255,255,.06)", backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,.15)", borderRadius: 16,
        width: "100%", maxWidth: 420, boxShadow: "0 24px 80px rgba(0,0,0,.45)", overflow: "hidden",
      }}>

        {/* Cabecera */}
        <div style={{ background: "rgba(255,255,255,.05)", borderBottom: "1px solid rgba(255,255,255,.1)", padding: "28px 32px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
            <div style={{
              width:52, height:52, background:`linear-gradient(135deg, ${P.blue}, ${P.accent})`,
              borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:26, boxShadow:"0 4px 16px rgba(20,114,196,.4)", flexShrink:0,
            }}>🌿</div>
            <div>
              <div style={{ fontFamily:"monospace", fontSize:"0.54rem", color:"rgba(170,196,224,.8)", textTransform:"uppercase", letterSpacing:".12em", marginBottom:2 }}>República Argentina · SENASA</div>
              <div style={{ fontFamily:"Georgia,serif", fontSize:"1.6rem", color:"#fff", letterSpacing:"-.01em", lineHeight:1 }}>FitoFichas</div>
            </div>
          </div>
          <div style={{ fontFamily:"monospace", fontSize:"0.58rem", color:"rgba(170,196,224,.7)", textTransform:"uppercase", letterSpacing:".08em" }}>
            Sistema Nacional de Fichas Fitosanitarias
          </div>
        </div>

        {/* Formulario */}
        <div style={{ padding: "28px 32px 32px" }}>
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:"1.05rem", fontWeight:600, color:"#fff", marginBottom:6 }}>Acceder al sistema</div>
            <div style={{ fontSize:"0.78rem", color:"rgba(170,196,224,.75)", lineHeight:1.5 }}>
              Ingresá tus credenciales para gestionar las fichas fitosanitarias.
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontFamily:"monospace", fontSize:"0.6rem", color:"rgba(170,196,224,.9)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>Usuario</label>
              <input
                type="text" value={user} autoComplete="username"
                onChange={e => { setUser(e.target.value); setError(""); }}
                placeholder="nombre de usuario"
                style={IN}
                onFocus={e => e.target.style.borderColor = "rgba(20,114,196,.8)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,.2)"}
              />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontFamily:"monospace", fontSize:"0.6rem", color:"rgba(170,196,224,.9)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>Contraseña</label>
              <div style={{ position:"relative" }}>
                <input
                  type={showPass ? "text" : "password"} value={pass} autoComplete="current-password"
                  onChange={e => { setPass(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  style={{ ...IN, paddingRight:42 }}
                  onFocus={e => e.target.style.borderColor = "rgba(20,114,196,.8)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,.2)"}
                />
                <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1} style={{
                  position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                  background:"none", border:"none", color:"rgba(170,196,224,.6)", cursor:"pointer",
                  fontSize:"0.85rem", padding:2, lineHeight:1,
                }}>{showPass ? "🙈" : "👁"}</button>
              </div>
            </div>

            {error && (
              <div style={{
                background:"rgba(163,45,45,.25)", border:"1px solid rgba(163,45,45,.5)",
                borderRadius:7, padding:"9px 13px", marginBottom:16,
                fontSize:"0.78rem", color:"#f0a0a0", display:"flex", alignItems:"center", gap:8,
              }}>⚠ {error}</div>
            )}

            {/* Panel de configuración de BD */}
            {showCfg && (
              <div style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.15)", borderRadius:8, padding:"14px 16px", marginBottom:16 }}>
                <div style={{ fontFamily:"monospace", fontSize:"0.58rem", color:"rgba(170,196,224,.8)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:10 }}>⚙ Configurar base de datos</div>
                <input type="text" value={cfgUrl} onChange={e => setCfgUrl(e.target.value)}
                  placeholder="URL de Supabase  (https://xxx.supabase.co)"
                  style={{ ...IN, marginBottom:8, fontSize:"0.75rem" }} />
                <input type="text" value={cfgKey} onChange={e => setCfgKey(e.target.value)}
                  placeholder="Anon / Publishable key  (sb_publishable_...)"
                  style={{ ...IN, marginBottom:10, fontSize:"0.75rem" }} />
                <button type="button" onClick={saveConfig} style={{
                  width:"100%", background: cfgOk ? "#1d9e75" : "rgba(20,114,196,.6)",
                  border:"none", borderRadius:6, padding:"9px 0",
                  color:"#fff", fontFamily:"inherit", fontSize:"0.8rem", fontWeight:600, cursor:"pointer",
                }}>
                  {cfgOk ? "✓ Guardado" : "Guardar configuración"}
                </button>
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width:"100%", background:`linear-gradient(135deg, ${P.blue}, #1060a0)`,
              border:"none", borderRadius:8, padding:"13px 0",
              color:"#fff", fontFamily:"inherit", fontSize:"0.9rem", fontWeight:600,
              cursor: loading ? "wait" : "pointer",
              boxShadow:"0 4px 18px rgba(20,114,196,.4)",
              transition:"all .15s", opacity: loading ? 0.8 : 1,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              {loading ? (
                <>
                  <span style={{ display:"inline-block", width:16, height:16, border:"2px solid rgba(255,255,255,.4)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite" }} />
                  Verificando...
                </>
              ) : "Ingresar →"}
            </button>
            <button type="button" onClick={() => setShowCfg(v => !v)} style={{
              width:"100%", background:"transparent", border:"none", marginTop:10,
              color:"rgba(112,144,176,.6)", fontFamily:"monospace", fontSize:"0.58rem",
              cursor:"pointer", textAlign:"center", letterSpacing:".06em",
            }}>
              {showCfg ? "▲ Ocultar configuración" : "⚙ Configurar base de datos"}
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop:28, textAlign:"center" }}>
        <div style={{ fontFamily:"monospace", fontSize:"0.56rem", color:"rgba(112,144,176,.6)", textTransform:"uppercase", letterSpacing:".1em", marginBottom:4 }}>
          SENASA · Servicio Nacional de Sanidad y Calidad Agroalimentaria
        </div>
        <div style={{ fontFamily:"monospace", fontSize:"0.54rem", color:"rgba(112,144,176,.45)", letterSpacing:".06em" }}>
          Dirección Nacional de Protección Vegetal · Argentina
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(170,196,224,.35); }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 100px #0a2040 inset !important; -webkit-text-fill-color: #fff !important; }
      `}</style>
    </div>
  );
}
