import { useState, useEffect } from "react";
import { P } from "../constants";
import { sbReady } from "../lib/supabase";
import { dbLoadPerfiles, dbSetPerfilRol } from "../services/db";

export default function RolesManager({ authUser }) {
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!sbReady()) { setLoading(false); return; }
    dbLoadPerfiles()
      .then(setPerfiles)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const cambiar = async (username, rol) => {
    setGuardando(username);
    try {
      await dbSetPerfilRol(username, rol);
      setPerfiles(prev => prev.map(p => p.username === username ? { ...p, rol } : p));
    } catch (e) {
      setErr(e.message);
    } finally {
      setGuardando(null);
    }
  };

  const ROL_LABEL = { admin: "Admin", user: "User" };
  const ROL_COLOR = { admin: P.accent, user: P.blue };
  const ROL_BG    = { admin: P.accentL, user: P.blueL };

  if (!sbReady()) return (
    <div style={{ textAlign: "center", padding: "52px 20px" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
      <div style={{ fontFamily: "Georgia,serif", fontSize: "1.1rem", color: P.navy, marginBottom: 6 }}>Base de datos no configurada</div>
      <div style={{ fontSize: "0.8rem", color: P.txt3 }}>Configurá la conexión a Supabase para gestionar roles.</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ background: "#fff", border: `1px solid ${P.border}`, borderRadius: 10, marginBottom: 20, overflow: "hidden", boxShadow: "0 2px 10px rgba(7,25,58,.06)" }}>
        <div style={{ background: P.navy, padding: "12px 18px" }}>
          <div style={{ fontFamily: "Georgia,serif", color: "#fff", fontSize: "1rem" }}>👤 Roles de usuario</div>
          <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#7090b0", marginTop: 1 }}>
            Asigná permisos a cada usuario registrado en el sistema
          </div>
        </div>
      </div>

      {err && (
        <div style={{ marginBottom: 14, padding: "8px 12px", background: P.redL, border: `1px solid #e0a0a0`, borderRadius: 6, fontFamily: "monospace", fontSize: "0.72rem", color: P.red }}>⚠ {err}</div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: P.txt3, fontFamily: "monospace", fontSize: "0.8rem" }}>Cargando usuarios…</div>
      ) : perfiles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "52px 20px" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>👤</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: "1.1rem", color: P.navy, marginBottom: 6 }}>Sin usuarios registrados</div>
          <div style={{ fontSize: "0.8rem", color: P.txt3 }}>Los usuarios aparecen aquí la primera vez que inician sesión.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${P.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 8px rgba(7,25,58,.05)" }}>
          {perfiles.map((p, i) => {
            const esSelf = p.username === authUser;
            return (
              <div key={p.username} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
                borderBottom: i < perfiles.length - 1 ? `1px solid ${P.border}` : "none",
              }}>
                <span style={{ fontSize: "1.1rem" }}>👤</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "0.88rem", color: P.navy, fontWeight: esSelf ? 600 : 400 }}>
                    {p.username}
                  </span>
                  {esSelf && (
                    <span style={{ fontFamily: "monospace", fontSize: "0.56rem", color: P.txt3, marginLeft: 8 }}>(vos)</span>
                  )}
                </div>
                {esSelf ? (
                  <span style={{
                    fontFamily: "monospace", fontSize: "0.64rem", fontWeight: 700,
                    background: ROL_BG[p.rol] || P.bg, color: ROL_COLOR[p.rol] || P.txt2,
                    padding: "4px 14px", borderRadius: 20, border: `1px solid ${P.border}`,
                  }}>
                    {ROL_LABEL[p.rol] || p.rol}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    {["admin", "user"].map(r => (
                      <button key={r} onClick={() => cambiar(p.username, r)}
                        disabled={guardando === p.username}
                        style={{
                          fontFamily: "monospace", fontSize: "0.66rem", fontWeight: 600,
                          padding: "5px 16px", borderRadius: 20,
                          cursor: guardando === p.username ? "wait" : "pointer",
                          border: `1.5px solid ${p.rol === r ? ROL_COLOR[r] : P.border}`,
                          background: p.rol === r ? ROL_BG[r] : "#fff",
                          color: p.rol === r ? ROL_COLOR[r] : P.txt3,
                          transition: "all .12s", opacity: guardando === p.username ? 0.6 : 1,
                        }}>
                        {p.rol === r ? "✓ " : ""}{ROL_LABEL[r]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
