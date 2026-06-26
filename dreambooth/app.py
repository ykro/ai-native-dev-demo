"""DreamBooth — Verbal dream description → visual dream journal with surrealist imagery.

Demo for Charla 1: "Construí una App con IA y No Escribí (casi) Nada"
Flow: Text/Voice (Web Speech API) → extract scenes → generate interpretation → generate surrealist images
"""

import base64
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

from google import genai
from google.genai import types

# Initialize client
client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))
TEXT_MODEL = "gemini-3.1-flash-lite-preview"
IMAGE_MODEL = "gemini-3.1-flash-image-preview"

app = FastAPI(title="DreamBooth")

# Serve static files (Vite build output)
static_dir = Path(__file__).parent / "static" / "dist"
app.mount("/static/dist", StaticFiles(directory=str(static_dir)), name="static")


class DreamRequest(BaseModel):
    text: str


class DreamResponse(BaseModel):
    scenes: str
    interpretation: str
    images: list[str]


@app.get("/")
async def index():
    return FileResponse(str(static_dir / "index.html"))


def extract_dream_scenes(dream_text: str) -> str:
    """Step 1: Extract key scenes from the dream description."""
    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=
                        f'Someone described this dream:\n\n"{dream_text}"\n\n'
                        "Extract exactly 3 key visual scenes from this dream. For each scene:\n"
                        "1. Describe the visual elements in detail (colors, shapes, objects, atmosphere)\n"
                        "2. Note the emotional tone (anxiety, wonder, peace, chaos, etc.)\n"
                        "3. Identify surreal or impossible elements\n\n"
                        "Format:\n"
                        "SCENE 1: [Visual description]\n"
                        "EMOTION: [Emotional tone]\n\n"
                        "SCENE 2: [Visual description]\n"
                        "EMOTION: [Emotional tone]\n\n"
                        "SCENE 3: [Visual description]\n"
                        "EMOTION: [Emotional tone]\n"
                    ),
                ],
            )
        ],
    )
    return response.text


def generate_interpretation(dream_text: str, scenes: str) -> str:
    """Step 2: Generate a dream interpretation."""
    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=
                        f'Dream description: "{dream_text}"\n\n'
                        f"Extracted scenes:\n{scenes}\n\n"
                        "Write a brief, poetic dream interpretation (3-4 sentences). "
                        "Reference specific symbols from the dream and suggest what they might represent. "
                        "Use a tone that's mystical but not pseudoscientific. "
                        "Write in Spanish."
                    ),
                ],
            )
        ],
    )
    return response.text


def generate_dream_images(scenes: str) -> list[str]:
    """Step 3: Generate surrealist images for each dream scene. Returns base64 data URIs."""
    # Parse scenes
    scene_descriptions: list[str] = []
    current_scene: list[str] = []
    for line in scenes.split("\n"):
        line = line.strip()
        if line.startswith("SCENE"):
            if current_scene:
                scene_descriptions.append(" ".join(current_scene))
                current_scene = []
            desc = line.split(":", 1)[1].strip() if ":" in line else line
            current_scene.append(desc)
        elif line.startswith("EMOTION:"):
            emotion = line.split(":", 1)[1].strip()
            current_scene.append(f"Emotional tone: {emotion}")
    if current_scene:
        scene_descriptions.append(" ".join(current_scene))

    if not scene_descriptions:
        scene_descriptions = [scenes]

    images: list[str] = []
    for scene_desc in scene_descriptions:
        prompt = (
            f"Create a surrealist dream illustration. "
            f"Scene: {scene_desc}. "
            f"Style: Salvador Dalí meets Studio Ghibli. Dreamlike, impossible physics, "
            f"melting forms, floating objects, ethereal lighting, rich saturated colors, "
            f"soft gradients blending into impossible horizons. No text."
        )

        response = client.models.generate_content(
            model=IMAGE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data:
                b64 = base64.b64encode(part.inline_data.data).decode()
                mime = part.inline_data.mime_type or "image/png"
                images.append(f"data:{mime};base64,{b64}")
                break

    return images


@app.post("/dream")
async def dream(req: DreamRequest):
    try:
        scenes = extract_dream_scenes(req.text)
        interpretation = generate_interpretation(req.text, scenes)
        images = generate_dream_images(scenes)
        return {"scenes": scenes, "interpretation": interpretation, "images": images}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
