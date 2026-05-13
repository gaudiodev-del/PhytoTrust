# FitoFichas — Instrucciones para Claude

## Generar una ficha fitosanitaria

Cuando el usuario escriba `ficha [nombre de la plaga]` o pida generar una ficha, responder **únicamente** con el bloque JSON completo, listo para pegar en la app.

### Reglas obligatorias

- El JSON debe ser válido y estar dentro de un bloque de código ` ```json `.
- Todos los campos deben estar presentes, sin excepción.
- `tipoplaga` debe ser exactamente uno de estos valores:
  `Ácaros` · `Anélidos` · `Bacterias` · `Crustáceos` · `Fitoplasmas` · `Hongos y/ó Pseudohongos` · `Insectos` · `Especie Vegetal` · `Miriápodos` · `Moluscos` · `Nemátodos` · `Protista` · `Vertebrados` · `Virus ó viroides`
- `presencia_mundial` debe usar los códigos ISO 2 de los países que figuran en la app (ver lista abajo). Solo incluir países donde hay datos verificados.
- `estado` en `presencia_mundial` debe ser exactamente uno de: `presente` · `cuarentena` · `ausente_riesgo` · `erradicada`
- `condicion_sinavimo` debe obtenerse exclusivamente de sinavimo.gov.ar. Si la especie no figura en ese sitio, poner exactamente `"Desconocida"`. No inferir ni inventar la condición.
- Los valores de `impacto_comercial` son enteros del 0 al 10.
- Las descripciones (`descripcion_biologica`, `signos_sintomas`, `condiciones_predisponentes`) deben ser técnicas, detalladas y basadas en fuentes reconocidas (CABI, EPPO, SINAVIMO, INTA, FAO).
- `fuentes` debe tener al menos 3 referencias bibliográficas reales, en formato objeto con `id`, `referencia`, `url` y `tipo`.
- `tipo` en fuentes debe ser exactamente uno de: `base_datos` · `articulo` · `informe` · `libro`
- Cada sección de contenido debe tener su campo `_refs` con los IDs de las fuentes que la respaldan. Campos: `descripcion_biologica_refs`, `signos_sintomas_refs`, `condiciones_predisponentes_refs`, `presencia_mundial_refs`, `impacto_comercial_refs`, `condicion_sinavimo_refs` (este último solo si hay fuente verificada).

### Formato JSON

```json
{
  "nombre_cientifico": "Género especie Autor año",
  "sinonimias": "Sinónimo 1, Sinónimo 2 (o vacío)",
  "nombre_vulgar": "Nombre común en español",
  "tipoplaga": "uno de los valores válidos",
  "taxonomia": {
    "reino": "",
    "filo": "",
    "clase": "",
    "orden": "",
    "familia": "",
    "genero": "",
    "especie": ""
  },
  "condicion_sinavimo": "Condición oficial según SINAVIMO (sinavimo.gov.ar). Valores típicos: 'Plaga Cuarentenaria Ausente', 'Plaga Cuarentenaria Presente', 'Plaga No Cuarentenaria Presente', 'Plaga No Cuarentenaria Ausente'. Si no figura en SINAVIMO poner exactamente: 'Desconocida'.",
  "descripcion_biologica": "Descripción técnica detallada: morfología, ciclo de vida, reproducción, estructuras relevantes. Mínimo 150 palabras.",
  "signos_sintomas": "Descripción detallada por órgano afectado (hojas, tallos, raíces, frutos, etc.). Mínimo 100 palabras.",
  "condiciones_predisponentes": "Temperatura óptima, humedad, factores del cultivo y ambientales. Mínimo 80 palabras.",
  "presencia_mundial": [
    {"iso": "AR", "nombre": "Argentina", "estado": "presente"}
  ],
  "impacto_comercial": {
    "restricciones_cuarentenarias": 0,
    "perdidas_produccion": 0,
    "mercados_afectados": 0,
    "costo_control": 0,
    "impacto_exportaciones": 0,
    "descripcion": "Párrafo breve sobre el impacto económico concreto para Argentina."
  },
  "descripcion_biologica_refs": [1, 2],
  "signos_sintomas_refs": [1, 3],
  "condiciones_predisponentes_refs": [2, 3],
  "presencia_mundial_refs": [1, 2],
  "impacto_comercial_refs": [2, 3],
  "fuentes": [
    { "id": 1, "referencia": "CABI Compendium (año). Nombre especie. CABI International.", "url": "https://doi.org/...", "tipo": "base_datos" },
    { "id": 2, "referencia": "EPPO Global Database (año). Código EPPO.", "url": "https://gd.eppo.int/taxon/...", "tipo": "base_datos" },
    { "id": 3, "referencia": "Apellido, A. (año). Título del artículo. Revista, vol(n), pp.", "url": "https://doi.org/...", "tipo": "articulo" }
  ]
}
```

### Códigos ISO 2 disponibles en la app

AF AL DZ AO AR AU AT BD BE BO BR BG KH CM CA LK CL CN CO CG CD CR HR CU DK DO EC EG ET FI FR DE GH GR GT HN HU IN ID IR IQ IE IL IT JM JP JO KZ KE KP KR LB LV LT MG MY MX MA MZ NA NP NL NZ NG NO PK PA PY PE PH PL PT RO RU RW SA SN SK ZA ES SE CH SY TH TN TR UG UA GB US UY UZ VE VN YE ZW ZM CI TZ BY GE AZ

---

## Otros comandos

- `editar ficha [nombre]` → devolver el JSON modificado con los cambios solicitados.
- `lista fichas` → listar fichas cargadas en localStorage (no disponible desde Claude, recordar al usuario que lo vea en la app).
