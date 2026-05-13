# 🌿 FitoFichas

**Sistema de Fichas Fitosanitarias** — SENASA Argentina

Aplicación React para crear, gestionar y exportar fichas fitosanitarias de plagas con mapa mundial de distribución, gráfico de impacto comercial y exportación a PDF.

---

## Características

- 📋 **Fichas completas** con taxonomía, biología, síntomas y condiciones predisponentes
- 🗺️ **Mapa mundial interactivo** con distribución de presencia por país (datos TopoJSON real)
- 📊 **Gráfico de impacto comercial** para Argentina (5 categorías, 0–10)
- ⬇️ **Exportación a PDF** con diseño institucional SENASA
- 💾 **Persistencia local** (localStorage) — sin backend requerido
- ✏️ **Edición completa** de todas las fichas
- 🎨 **Diseño Azul Institucional** estilo SENASA

---

## Tipos de plaga soportados

Ácaros · Anélidos · Bacterias · Crustáceos · Fitoplasmas · Hongos y/ó Pseudohongos · Insectos · Especie Vegetal · Miriápodos · Moluscos · Nemátodos · Protista · Vertebrados · Virus ó viroides

---

## Instalación y uso

```bash
# 1. Clonar el repositorio
git clone https://github.com/TU_USUARIO/fitofichas.git
cd fitofichas

# 2. Instalar dependencias
npm install

# 3. Iniciar en modo desarrollo
npm run dev

# 4. Build para producción
npm run build
```

---

## Cómo agregar fichas

1. Escriba en Claude: `ficha Botrytis cinerea`
2. Claude genera el JSON completo con datos de CABI · EPPO · SINAVIMO · INTA
3. En la app → **➕ Nueva Ficha** → pegar el JSON → **✅ Cargar ficha**

### Formato JSON de ficha

```json
{
  "nombre_cientifico": "Botrytis cinerea Pers. ex Fr.",
  "sinonimias": "...",
  "nombre_vulgar": "Moho gris",
  "tipoplaga": "Hongos y/ó Pseudohongos",
  "taxonomia": {
    "reino": "Fungi",
    "filo": "Ascomycota",
    "clase": "Leotiomycetes",
    "orden": "Helotiales",
    "familia": "Sclerotiniaceae",
    "genero": "Botrytis",
    "especie": "Botrytis cinerea"
  },
  "descripcion_biologica": "...",
  "signos_sintomas": "...",
  "condiciones_predisponentes": "...",
  "presencia_mundial": [
    {"iso": "AR", "nombre": "Argentina", "estado": "presente"},
    {"iso": "US", "nombre": "Estados Unidos", "estado": "presente"}
  ],
  "impacto_comercial": {
    "restricciones_cuarentenarias": 3,
    "perdidas_produccion": 9,
    "mercados_afectados": 8,
    "costo_control": 7,
    "impacto_exportaciones": 9,
    "descripcion": "Descripción breve del impacto."
  },
  "fuentes": [
    "CABI Compendium (2024). Botrytis cinerea. https://...",
    "EPPO Global Database (2024). BOTRCI. https://..."
  ]
}
```

### Estados válidos para `presencia_mundial`

| Estado | Color | Descripción |
|--------|-------|-------------|
| `presente` | 🔵 Azul | Presente y establecida |
| `cuarentena` | 🔴 Rojo | Interceptada / en cuarentena |
| `ausente_riesgo` | 🟡 Amarillo | Ausente pero con riesgo de ingreso |
| `erradicada` | 🟣 Violeta | Erradicada |

---

## Stack tecnológico

- **React 18** + **Vite 6**
- **TopoJSON Client** (mapa mundial real — Natural Earth 110m)
- **World Atlas** (datos geográficos)
- Sin dependencias de UI externas — CSS-in-JS puro

---

## Fichas incluidas (ejemplos)

Las fichas **no** se incluyen en el repositorio — se generan con Claude y se guardan en localStorage del navegador. Fichas de ejemplo generadas:

- *Botrytis cinerea* — Moho gris
- *Phytophthora infestans* — Tizón tardío de la papa
- *Phthorimaea absoluta* (Tuta absoluta) — Polilla del tomate
- *Rhynchophorus ferrugineus* — Picudo rojo de las palmeras

---

## Licencia

MIT — uso libre con atribución.

---

*Desarrollado con Claude (Anthropic) · Datos: CABI · EPPO · SINAVIMO · INTA*
