import { IMPACT_CATS, P } from "../constants";
import { impColor } from "../utils/impColor";

export default function ImpactChart({ impacto }) {
  if (!impacto) return null;
  const overall = Math.round((IMPACT_CATS.reduce((s, c) => s + (impacto[c.key] || 0), 0) / IMPACT_CATS.length) * 10) / 10;
  const oc = impColor(overall);
  return (
    <div style={{ background: P.bg, border: `1px solid ${P.border}`, borderRadius: 8, padding: "14px 16px" }}>
      {IMPACT_CATS.map(({ key, label }) => {
        const s = impacto[key] || 0; const c = impColor(s);
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.59rem", color: P.txt2, width: 172, flexShrink: 0, textTransform: "uppercase", letterSpacing: ".03em", lineHeight: 1.3 }}>{label}</div>
            <div style={{ flex: 1, height: 14, background: "#dce8f5", borderRadius: 3, overflow: "hidden", position: "relative" }}>
              <div style={{ width: `${s * 10}%`, height: "100%", background: c.bar, borderRadius: 3, transition: "width .6s ease" }}>
                <span style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", fontFamily: "monospace", fontSize: "0.57rem", color: "rgba(255,255,255,.8)", fontWeight: 500 }}>{s}/10</span>
              </div>
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "0.65rem", color: c.text, width: 22, textAlign: "right", fontWeight: 600 }}>{s}</div>
          </div>
        );
      })}
      <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: oc.bg, border: `1px solid ${oc.bar}50`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: oc.text, fontWeight: 700 }}>Impacto global: {overall}/10</div>
        <div style={{ background: oc.bar, color: "#fff", fontSize: "0.65rem", fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>{oc.label}</div>
        {impacto.descripcion && <div style={{ fontSize: "0.72rem", color: P.txt2, flex: 1, lineHeight: 1.4 }}>{impacto.descripcion}</div>}
      </div>
    </div>
  );
}
