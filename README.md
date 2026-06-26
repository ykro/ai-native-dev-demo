# AI-Native Dev — Construí una App con IA y No Escribí (casi) Nada

Dos aplicaciones multimodales completas, construidas con **Google Antigravity** y la **API de Gemini 3.1**, desde la idea hasta el deploy en Cloud Run.

> **Este repo es material para aprender dos cosas: trabajar con [Google Antigravity](https://antigravity.google/) y desarrollar con SDD (Spec-Driven Development).** El código de las apps es la *evidencia* del proceso, no el objetivo. La idea central: dejas de escribir código línea por línea y pasas a ser el **arquitecto** que dirige agentes autónomos. No es vibe coding — tú defines la spec, el criterio de éxito y la arquitectura; los agentes implementan.

**Slides:** https://docs.google.com/presentation/d/1Xlhwl7338xxZzfv3znUzMLE3nEqJWfttCKKJ_6TTzI8/edit

| App | Qué hace | Demo en vivo |
|-----|----------|--------------|
| **[CityLore](#citylore-leyenda)** (leyenda) | Foto de un lugar → leyenda urbana ilustrada | https://citylore-611681112050.us-central1.run.app |
| **[DreamBooth](#dreambooth-sueño)** (sueño) | Describe un sueño (texto/voz) → diario visual surrealista | https://dreambooth-611681112050.us-central1.run.app |

---

## ¿Qué vas a aprender?

| Tema | Qué te llevas |
|------|---------------|
| **Antigravity como entorno agéntico** | Cómo dirigir agentes que mantienen contexto entre archivos, ejecutan y verifican el código, e iteran con diffs y checkpoints |
| **SDD (Spec-Driven Development)** | Escribir la spec *antes* del código y dejar que el agente la implemente — ver [la spec real de CityLore](#sdd-la-spec-maneja-el-codigo) |
| **Tu nuevo rol: arquitecto** | Decidir arquitectura, criterios de éxito y trade-offs en vez de teclear cada línea |
| **Iteración AI-native** | Cómo un problema real de producción se convierte en una mejora de arquitectura (ver [CityLore](#citylore-leyenda)) |

---

## Antigravity: trabajar como arquitecto, no como mecanógrafo

[Google Antigravity](https://antigravity.google/) es el entorno de desarrollo agéntico de Google: describes lo que quieres y un agente (potenciado por Gemini) genera y modifica el código por ti. Lo importante no es la herramienta sino el **cambio de flujo de trabajo**.

**Las piezas que usas en este repo:**

- **El agente mantiene el contexto completo** de tus prompts anteriores y del estado de los archivos, y maneja dependencias entre múltiples archivos automáticamente.
- **Ejecución verificada** — el agente corre el código para reducir alucinaciones, en vez de solo "escribir algo que parezca correcto".
- **Live preview + View diff** — ves la app corriendo en tiempo real y exactamente qué cambió después de cada prompt. Revisar el diff en cada paso es parte del método.
- **Checkpoints** — historial de versiones para volver a un estado que funcionaba. Regla práctica: si el agente falla después de **2 rondas de corrección, revierte al checkpoint** en vez de insistir.
- **Secrets Management** — las API keys viven en el servidor, nunca en el cliente. Por eso en este repo las keys van en `.env` (server-side) y jamás se commitean.
- **Deploy a Cloud Run** — de la idea a una URL pública en un paso. Las dos apps están desplegadas así.

**Cómo prompteas bien (lo que se demuestra en vivo):**

1. **Sé específico** — nombra tecnologías, estructura de datos, layout y comportamiento.
2. **Separa en archivos desde el inicio** — pídele estructura modular, no un mega-archivo.
3. **Un cambio a la vez** — cada prompt de refinamiento ataca un solo aspecto, y revisas el diff.
4. **Define el dato y el contrato primero** — esto enlaza directo con SDD.

---

## SDD: la spec maneja el código

**Spec-Driven Development** significa escribir la **especificación primero** —el contrato de la app: endpoints, inputs, outputs, eventos— y recién después dejar que el agente la implemente. La spec es la fuente de verdad: el agente trabaja contra ella y tú verificas contra ella.

Esta fue la spec real que dirigió la construcción de CityLore — antes de existir una sola línea de `app.py`:

```python
# CityLore API Specification

# POST /analyze
# Input: multipart/form-data with image file
# Output: { "job_id": "uuid" }  (returns immediately)

# GET /stream/{job_id}  (SSE — primary)
# Events:
#   event: step     -> { "step": 0, "name": "Analyzing place" }
#   event: analysis -> { "analysis": "..." }
#   event: legend   -> { "legend": "TITLE: ...\nPANEL 1: ..." }
#   event: panel    -> { "index": 0, "image": "data:image/png;base64,..." }
#   event: done
#   event: error    -> { "error": "message" }

# GET /status/{job_id}  (polling fallback)
# Output: { "status": "processing"|"done"|"error",
#            "step": 0-3, "analysis", "legend",
#            "panels": [...], "error" }

# Pipeline (async, panels in parallel):
#   analyze_place -> generate_legend
#                 -> generate_panels (4x concurrent)
```

Fíjate cómo cada decisión de esta spec —SSE como canal primario, polling como fallback, paneles en paralelo— **predetermina la arquitectura**. El agente no "inventó" el diseño: lo derivó del contrato que tú escribiste. Comparar `citylore/app.py` contra esta spec es el ejercicio: el código es la spec hecha realidad.

> **Por qué importa:** sin spec, le pides al agente "haz una app de leyendas" y obtienes algo impredecible. Con spec, el resultado es verificable y las iteraciones son acotadas. Esa es la diferencia entre vibe coding y desarrollo AI-native.

---

## Tech stack (compartido)

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11, FastAPI, uvicorn |
| AI | Google Gemini 3.1 (`google-genai`) — Vision · Text · Image Generation |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Deploy | Docker → Google Cloud Run |

**Modelos usados:**
- `gemini-3.1-flash-lite-preview` — texto y visión
- `gemini-3.1-flash-image-preview` — generación de imágenes

---

## CityLore (leyenda)

Sube una foto de cualquier lugar y Gemini genera una **leyenda urbana ilustrada** ambientada ahí. Es la app que implementa la [spec de arriba](#sdd-la-spec-maneja-el-codigo).

**Flujo:** Foto → Gemini Vision analiza arquitectura/época/contexto → genera una narrativa en 4 paneles → genera las ilustraciones estilo novela gráfica (en paralelo, con streaming SSE).

### Partes clave del código (`citylore/app.py`)

```python
client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))
VISION_MODEL = "gemini-3.1-flash-lite-preview"
IMAGE_MODEL  = "gemini-3.1-flash-image-preview"

# 1. Visión: analiza la foto
analyze_place(image_bytes, mime_type)      # → descripción del lugar
# 2. Texto: genera la leyenda en 4 paneles
generate_legend(place_analysis)            # → "PANEL 1: ... PANEL 4: ..."
# 3. Imagen: una ilustración por panel (en paralelo)
generate_single_panel(panel_desc, place_analysis)
```

- `POST /analyze` arranca un job en background y devuelve un `job_id`.
- `GET /stream/{job_id}` (SSE) emite cada panel a medida que se genera — la UI no espera a los 4.
- `GET /status/{job_id}` es el fallback por polling.

**Iteración AI-native de ejemplo:** la primera versión era un solo `POST` con paneles secuenciales (~100s de espera). En producción, los iPhones bloqueaban la pantalla y Safari mataba el request ("Load failed"). La solución —SSE + polling + paneles en paralelo con `asyncio.gather` (~40s)— nació de un problema real, no del diseño inicial. Así se ve iterar como arquitecto.

### Cómo correrlo

```bash
cd citylore
uv sync
cp .env.example .env          # pon tu GOOGLE_GENAI_API_KEY
cd frontend && npm install && npm run build && cd ..
uv run uvicorn app:app --reload --port 8000
```

Abre http://localhost:8000 y sube una foto.

---

## DreamBooth (sueño)

Describe un sueño (escribiéndolo o **por voz**) y obtén un **diario visual** con imágenes surrealistas generadas por Gemini.

**Flujo:** Texto/Voz (Web Speech API) → extrae 3 escenas → genera una interpretación poética → genera ilustraciones estilo "Dalí meets Studio Ghibli".

### Partes clave del código (`dreambooth/app.py`)

```python
client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))
TEXT_MODEL  = "gemini-3.1-flash-lite-preview"
IMAGE_MODEL = "gemini-3.1-flash-image-preview"

# Un solo endpoint orquesta las 3 etapas:
extract_dream_scenes(dream_text)              # → 3 escenas
generate_interpretation(dream_text, scenes)   # → interpretación poética
generate_dream_images(scenes)                 # → imágenes base64
```

- `POST /dream` recibe `{ dream_text }` y devuelve interpretación + imágenes.
- La captura de voz es 100% frontend con la **Web Speech API** (Chrome/Edge).

### Cómo correrlo

```bash
cd dreambooth
uv sync
cp .env.example .env          # pon tu GOOGLE_GENAI_API_KEY
cd frontend && npm install && npm run build && cd ..
uv run uvicorn app:app --reload --port 8001
```

Abre http://localhost:8001 — escribe el sueño o usa el micrófono.

---

## Requisitos

- Python 3.11+ y [`uv`](https://github.com/astral-sh/uv)
- Node 18+ (solo si modificas el frontend)
- Una API key de Google Gemini ([AI Studio](https://aistudio.google.com/apikey))

> **Nota:** las API keys nunca se commitean. En cada app, copia `.env.example` a `.env` con tu propia key.

---

## Próximos pasos para seguir aprendiendo

- **Escribe la spec de DreamBooth** (no está en este repo) mirando `dreambooth/app.py` en reversa: ¿qué endpoints, inputs y outputs definirías? Ese es el ejercicio inverso de SDD.
- **Toma una de las apps y pídele a Antigravity un cambio** (ej. agregar un 5º panel a CityLore) practicando "un cambio a la vez" y revisando el diff.
- **Compara la spec contra `citylore/app.py`** línea por línea para ver cómo cada decisión de contrato se materializó en código.
