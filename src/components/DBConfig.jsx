import { useState, useEffect } from "react";
import { P } from "../constants";
import { sbConfig, sbSetConfig, sbClearConfig, sbClient, sbReady } from "../lib/supabase";
import { dbSyncFichas } from "../services/db";

export default function DBConfig({ onClose, fichas }) {
  const cfg = sbConfig();
  const [url, setUrl]       = useState(cfg.url);
  const [key, setKey]       = useState(cfg.key);
  const [showKey, setShowKey] = useState(false);
  const [testando, setTestando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [conectado, setConectado] = useState(sbReady());
  const [msg, setMsg]       = useState(null); // { tipo: 'ok'|'err', texto }

  useEffect(() => {
    const handler = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const guardar = async () => {
    if (!url.trim() || !key.trim()) {
      setMsg({ tipo: "err", texto: "Completá los dos campos." }); return;
    }
    setTestando(true); setMsg(null);
    sbSetConfig(url, key);
    try {
      const sb = sbClient();
      const { error } = await sb.from("fichas").select("id").limit(1);
      if (error) throw error;
      setConectado(true);
      setMsg({ tipo: "ok", texto: "¡Conexión exitosa! Los datos se sincronizarán automáticamente." });
    } catch (e) {
      sbClearConfig();
      setConectado(false);
      setMsg({ tipo: "err", texto: `Error de conexión: ${e.message}` });
    }
    setTestando(false);
  };

  const limpiar = () => {
    sbClearConfig();
    setUrl(""); setKey(""); setConectado(false);
    setMsg({ tipo: "ok", texto: "Configuración eliminada. La app sigue funcionando con localStorage." });
  };

  const sincronizar = async () => {
    setSincronizando(true); setMsg(null);
    try {
      await dbSyncFichas(fichas);
      // Disparar evento para que ArticulosBuscador sincronice sus sets
      window.dispatchEvent(new CustomEvent("fitofichas:sync-sets"));
      setMsg({ tipo: "ok", texto: `✓ ${fichas.length} fichas sincronizadas. Los sets de búsqueda también fueron enviados.` });
    } catch (e) {
      setMsg({ tipo: "err", texto: `Error al sincronizar: ${e.message}` });
    }
    setSincronizando(false);
  };

  const IN = {
    width: "100%", padding: "9px 12px", borderRadius: 5, fontFamily: "monospace",
    fontSize: "0.8rem", color: P.txt, outline: "none",
    border: `1.5px solid ${P.border2}`, background: "#fff", boxSizing: "border-box",
  };
  const BTN = {
    fontFamily: "inherit", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer",
    padding: "9px 18px", borderRadius: 5, border: "none", transition: "all .12s",
  };
  const LBL = {
    fontFamily: "monospace", fontSize: "0.6rem", color: P.blue,
    textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: 5,
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: "fixed", inset: 0, background: "rgba(7,25,58,.75)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, backdropFilter: "blur(3px)",
    }}>
      <div style={{
        background: "#fff", borderRadius: 10, width: "100%", maxWidth: 560,
        maxHeight: "95vh", overflowY: "auto",
        boxShadow: "0 8px 40px rgba(7,25,58,.3)",
        border: `1px solid ${P.border}`,
      }}>
        {/* Header */}
        <div style={{
          background: P.navy, padding: "15px 20px", borderRadius: "10px 10px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ color: "#fff", fontFamily: "Georgia,serif", fontSize: "1.05rem" }}>
              ☁ Base de Datos en la Nube
            </div>
            <div style={{ color: "#7090b0", fontFamily: "monospace", fontSize: "0.58rem", marginTop: 2 }}>
              Supabase · Sincronización permanente
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)",
            color: "#fff", width: 30, height: 30, borderRadius: 6, cursor: "pointer",
            fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "20px 22px" }}>

          {/* Estado actual */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 7, marginBottom: 20,
            background: conectado ? P.accentL : P.bg,
            border: `1px solid ${conectado ? "#9fe1cb" : P.border}`,
          }}>
            <span style={{ fontSize: 18 }}>{conectado ? "🟢" : "🔴"}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.82rem", color: conectado ? "#0f6e56" : P.navy }}>
                {conectado ? "Conectado a Supabase" : "Sin conexión a la nube"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "0.62rem", color: P.txt3 }}>
                {conectado
                  ? "Los datos se sincronizan automáticamente en segundo plano"
                  : "Los datos se guardan solo en este navegador (localStorage)"}
              </div>
            </div>
          </div>

          {/* Cómo obtener los datos */}
          <details style={{ marginBottom: 18 }}>
            <summary style={{
              cursor: "pointer", fontFamily: "monospace", fontSize: "0.68rem",
              color: P.blue, fontWeight: 600, userSelect: "none",
              padding: "6px 10px", background: P.blueL, borderRadius: 5,
            }}>
              ℹ ¿Cómo obtengo la URL y la API Key? (clic para ver)
            </summary>
            <div style={{
              marginTop: 8, padding: "12px 14px", background: P.bg,
              border: `1px solid ${P.border}`, borderRadius: 6,
              fontFamily: "monospace", fontSize: "0.68rem", color: P.txt2, lineHeight: 1.8,
            }}>
              <strong style={{ color: P.navy }}>1.</strong> Ir a{" "}
              <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: P.blue }}>supabase.com</a>{" "}
              → Crear cuenta gratuita → Nuevo proyecto<br />
              <strong style={{ color: P.navy }}>2.</strong> En el proyecto: <strong>Settings</strong> → <strong>API</strong><br />
              <strong style={{ color: P.navy }}>3.</strong> Copiar <strong>Project URL</strong> y <strong>anon public</strong> key<br />
              <strong style={{ color: P.navy }}>4.</strong> Ir a <strong>SQL Editor</strong> → pegar y ejecutar el contenido de{" "}
              <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 3 }}>supabase_setup.sql</code><br />
              <br />
              <span style={{ color: "#b06000" }}>
                ⚠ Plan gratuito: el proyecto se pausa tras 1 semana sin actividad.
                Si eso ocurre, entrá a supabase.com y hacé clic en "Restore project".
              </span>
            </div>
          </details>

          {/* Formulario */}
          <div style={{ marginBottom: 14 }}>
            <label style={LBL}>Project URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://xxxxxxxxxxx.supabase.co"
              style={IN}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={LBL}>Anon Key (clave pública)</label>
            <div style={{ position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                style={{ ...IN, paddingRight: 70 }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "monospace", fontSize: "0.62rem", color: P.txt3,
                }}
              >
                {showKey ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {/* Mensaje de estado */}
          {msg && (
            <div style={{
              padding: "8px 12px", borderRadius: 5, marginBottom: 16,
              fontFamily: "monospace", fontSize: "0.72rem",
              background: msg.tipo === "ok" ? P.accentL : P.redL,
              border: `1px solid ${msg.tipo === "ok" ? "#9fe1cb" : "#e0a0a0"}`,
              color: msg.tipo === "ok" ? "#0f6e56" : P.red,
            }}>
              {msg.texto}
            </div>
          )}

          {/* Botones */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={guardar}
              disabled={testando || !url.trim() || !key.trim()}
              style={{
                ...BTN,
                background: testando ? P.txt3 : P.blue, color: "#fff",
                opacity: testando ? 0.7 : 1,
                cursor: testando ? "wait" : "pointer",
              }}
            >
              {testando ? "⏳ Verificando…" : "💾 Guardar y conectar"}
            </button>

            {conectado && (
              <button
                onClick={sincronizar}
                disabled={sincronizando}
                style={{
                  ...BTN,
                  background: sincronizando ? P.txt3 : P.accent, color: "#fff",
                  opacity: sincronizando ? 0.7 : 1,
                  cursor: sincronizando ? "wait" : "pointer",
                }}
              >
                {sincronizando ? "⏳ Sincronizando…" : `☁ Subir todos los datos (${fichas.length} fichas)`}
              </button>
            )}

            {conectado && (
              <button
                onClick={limpiar}
                style={{
                  ...BTN, marginLeft: "auto",
                  background: P.redL, border: `1px solid #e0a0a0`, color: P.red,
                }}
              >
                Desconectar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
