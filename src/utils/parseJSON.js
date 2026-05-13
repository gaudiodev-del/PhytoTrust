export function parseJSON(txt) {
  const clean = txt.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No se encontró un objeto JSON válido.");
  const obj = JSON.parse(match[0]);
  if (!obj.nombre_cientifico) throw new Error("Falta el campo 'nombre_cientifico'.");
  return obj;
}
