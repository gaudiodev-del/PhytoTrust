import { useState, useEffect } from "react";
import { P } from "../constants";
import { sbReady } from "../lib/supabase";
import { dbLoadEquipos, dbUpsertEquipo, dbDeleteEquipo, dbLoadPerfiles } from "../services/db";

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ── Modal edición ──────────────────────────────────────────────────────────────
function EditarEquipoModal({ equipo, perfiles, authUser, onGuardar, onCerrar }) {
  const [nombre, setNombre] = useState(equipo.nombre || "");
  const [miembros, setMiembros] = useState(equipo.miembros || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const toggle = u => setMiembros(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);

  const handleGuardar = async () => {
    if (!nombre.trim()) { setErr("El nombre del equipo es obligatorio."); return; }
    setSaving(true);
    try { await onGuardar({ ...equipo, nombre: nombre.trim(), miembros }); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  const otros = perfiles.map(p => p.username).filter(u => u !== authUser).sort((a, b) => a.localeCompare(b));
  const esNuevo = !equipo._exists;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(7,25,58,.65)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480,
        boxShadow: "0 24px 60px rgba(0,0,0,.35)", overflow: "hidden",
      }}>
        <div style={{ background: P.navy, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "Georgia,serif", color: "#fff", fontSize: "1rem" }}>
            {esNuevo ? "➕ Nuevo equipo" : "✏ Editar equipo"}
          </span>
          <button onClick={onCerrar} style={{ background: "none", border: "none", color: "#aac4e0", fontSize: "1.3rem", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "20px 22px" }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>
              Nombre del equipo
            </label>
            <input
              type="text" value={nombre} autoFocus
              onChange={e => { setNombre(e.target.value); setErr(""); }}
              placeholder="Ej. Equipo Fitopatología"
              style={{ width: "100%", border: `1.5px solid ${P.border2}`, borderRadius: 6, padding: "9px 12px", fontFamily: "inherit", fontSize: "0.88rem", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <div>
            <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: P.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
              Miembros
              {miembros.length > 0 && <span style={{ color: P.accent, marginLeft: 6 }}>· {miembros.length} seleccionado{miembros.length !== 1 ? "s" : ""}</span>}
            </div>
            {otros.length === 0 ? (
              <div style={{ fontFamily: "monospace", fontSize: "0.72rem", color: P.txt3, padding: "12px 14px", background: P.bg, borderRadius: 6, border: `1px solid ${P.border}` }}>
                No hay otros usuarios registrados. Aparecerán aquí la primera vez que inicien sesión.
              </div>
            ) : (
              <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${P.border}`, borderRadius: 6, background: P.bg }}>
                {otros.map((u, i) => {
                  const sel = miembros.includes(u);
                  return (
                    <label key={u} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 13px",
                      cursor: "pointer", background: sel ? P.blueL : "transparent",
                      borderBottom: i < otros.length - 1 ? `1px solid ${P.border}` : "none",
                      transition: "background .1s",
                    }}>
                      <input type="checkbox" checked={sel} onChange={() => toggle(u)}
                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: P.blue }} />
                      <span style={{ fontSize: "0.85rem", color: P.navy, fontWeight: sel ? 600 : 400 }}>
                        👤 {u}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {err && (
            <div style={{ marginTop: 12, padding: "7px 11px", background: P.redL, border: `1px solid #e0a0a0`, borderRadius: 5, fontFamily: "monospace", fontSize: "0.72rem", color: P.red }}>
              ⚠ {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button onClick={onCerrar} style={{ background: "transparent", border: `1px solid ${P.border2}`, color: P.txt3, borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem" }}>
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={saving} style={{
              background: P.blue, color: "#fff", border: "none", borderRadius: 6,
              padding: "8px 24px", cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 600, opacity: saving ? 0.75 : 1,
            }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function EquiposManager({ authUser, authRole }) {
  const [equipos, setEquipos] = useState([]);
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!sbReady()) { setLoading(false); return; }
    Promise.all([dbLoadEquipos(), dbLoadPerfiles()])
      .then(([eqs, profs]) => { setEquipos(eqs); setPerfiles(profs); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const guardar = async equipo => {
    await dbUpsertEquipo(equipo);
    setEquipos(prev => {
      const existe = prev.find(e => e.id === equipo.id);
      const lista = existe ? prev.map(e => e.id === equipo.id ? equipo : e) : [...prev, equipo];
      return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
    setEditando(null);
  };

  const eliminar = async id => {
    if (!window.confirm("¿Eliminar este equipo?")) return;
    await dbDeleteEquipo(id).catch(e => setErr(e.message));
    setEquipos(prev => prev.filter(e => e.id !== id));
  };

  const nuevoEquipo = () => setEditando({
    id: genId(), nombre: "", owner: authUser, miembros: [],
    creado_el: new Date().toISOString(),
  });

  if (!sbReady()) return (
    <div style={{ textAlign: "center", padding: "52px 20px" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
      <div style={{ fontFamily: "Georgia,serif", fontSize: "1.1rem", color: P.navy, marginBottom: 6 }}>Base de datos no configurada</div>
      <div style={{ fontSize: "0.8rem", color: P.txt3 }}>Configurá la conexión a Supabase para usar equipos.</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ background: "#fff", border: `1px solid ${P.border}`, borderRadius: 10, marginBottom: 20, overflow: "hidden", boxShadow: "0 2px 10px rgba(7,25,58,.06)" }}>
        <div style={{ background: P.navy, padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Georgia,serif", color: "#fff", fontSize: "1rem" }}>👥 Gestión de Equipos</div>
            <div style={{ fontFamily: "monospace", fontSize: "0.58rem", color: "#7090b0", marginTop: 1 }}>
              Creá equipos de trabajo y compartí artículos favoritos con tus colegas
            </div>
          </div>
          <button onClick={nuevoEquipo} style={{
            background: P.accent, color: "#fff", border: "none", borderRadius: 7,
            padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 600,
          }}>+ Nuevo equipo</button>
        </div>
      </div>

      {err && (
        <div style={{ marginBottom: 14, padding: "8px 12px", background: P.redL, border: `1px solid #e0a0a0`, borderRadius: 6, fontFamily: "monospace", fontSize: "0.72rem", color: P.red }}>⚠ {err}</div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: P.txt3, fontFamily: "monospace", fontSize: "0.8rem" }}>Cargando…</div>
      ) : equipos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "52px 20px" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>👥</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: "1.1rem", color: P.navy, marginBottom: 6 }}>Sin equipos creados</div>
          <div style={{ fontSize: "0.8rem", color: P.txt3 }}>Creá tu primer equipo para compartir artículos con colegas.</div>
        </div>
      ) : (
        equipos.map(eq => {
          const esOwner = eq.owner === authUser;
          const todosMiembros = [eq.owner, ...(eq.miembros || [])];
          return (
            <div key={eq.id} style={{ background: "#fff", border: `1px solid ${P.border}`, borderRadius: 10, marginBottom: 12, boxShadow: "0 2px 8px rgba(7,25,58,.05)", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "Georgia,serif", fontSize: "1rem", color: P.navy, fontWeight: 600 }}>
                      👥 {eq.nombre}
                    </span>
                    {esOwner && (
                      <span style={{ fontFamily: "monospace", fontSize: "0.56rem", background: P.accentL, color: P.accent, padding: "1px 7px", borderRadius: 20, border: `1px solid #9fe1cb` }}>
                        Propietario
                      </span>
                    )}
                    <span style={{ fontFamily: "monospace", fontSize: "0.58rem", color: P.txt3 }}>
                      {todosMiembros.length} miembro{todosMiembros.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {todosMiembros.map(m => (
                      <span key={m} style={{
                        fontFamily: "monospace", fontSize: "0.66rem",
                        background: m === authUser ? P.blueL : P.bg,
                        color: m === authUser ? P.blue : P.txt2,
                        border: `1px solid ${m === authUser ? P.border2 : P.border}`,
                        padding: "2px 10px", borderRadius: 20,
                        fontWeight: m === authUser ? 600 : 400,
                      }}>
                        👤 {m}{m === eq.owner ? " (dueño)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
                {esOwner && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditando({ ...eq, _exists: true })} style={{ background: P.blueL, color: P.blue, border: `1px solid ${P.border}`, borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.66rem", fontWeight: 600 }}>
                      ✏ Editar
                    </button>
                    <button onClick={() => eliminar(eq.id)} style={{ background: P.redL, color: P.red, border: `1px solid #e0a0a0`, borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.66rem", fontWeight: 600 }}>
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {editando && (
        <EditarEquipoModal
          equipo={editando}
          perfiles={perfiles}
          authUser={authUser}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

