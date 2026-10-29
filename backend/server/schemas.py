"""Modeles Pydantic : validation et typage des corps de requete JSON.

Pydantic v2 (coeur Rust) valide et borne les entrees avant tout appel reseau,
ce qui evite les payloads malformes ou abusifs.
"""

from typing import Literal

from pydantic import BaseModel, Field


class QueryPayload(BaseModel):
    """Corps de /send-query-to-api."""

    query: str = Field(default="", max_length=4000)
    filename: str | None = None


class KlingImageRequest(BaseModel):
    """Corps de /kling/generate-image."""

    prompt: str = Field(min_length=1, max_length=4000)
    negative_prompt: str = Field(default="", max_length=4000)
    aspect_ratio: str = Field(default="16:9", max_length=10)
    n: int = Field(default=1, ge=1, le=4)


class KlingVideoRequest(BaseModel):
    """Corps de /kling/generate-video."""

    prompt: str = Field(min_length=1, max_length=4000)
    duration: str = Field(default="5", max_length=5)
    aspect_ratio: str = Field(default="16:9", max_length=10)
    mode: str = Field(default="std", max_length=10)


class KlingImageToVideoRequest(BaseModel):
    """Corps de /kling/image-to-video."""

    image_url: str = Field(min_length=1, max_length=4000)
    prompt: str = Field(default="", max_length=4000)
    duration: str = Field(default="5", max_length=5)
    mode: str = Field(default="std", max_length=10)


class OmniVideoRequest(BaseModel):
    """Corps de /kling/omni-video."""

    prompt: str = Field(min_length=1, max_length=4000)
    filename: str = Field(default="", max_length=512)
    mode: str = Field(default="pro", max_length=10)
    refer_type: str = Field(default="base", max_length=20)
    duration: str = Field(default="5", max_length=5)
    aspect_ratio: str | None = Field(default=None, max_length=10)


class LLMGenerateRequest(BaseModel):
    """Corps de /api/llm/generate (proxy multi-fournisseurs)."""

    capability: Literal["text", "image", "video"] = "text"
    prompt: str = Field(min_length=1, max_length=4000)
    options: dict = Field(default_factory=dict)


class EmojiPlanRequest(BaseModel):
    """Corps de /api/emoji/plan (studio emoji)."""

    prompt: str = Field(default="", max_length=500)
    emojis: list[str] = Field(default_factory=list, max_length=50)
    width: int = Field(default=960, ge=1, le=8192)
    height: int = Field(default=540, ge=1, le=8192)
    size: int = Field(default=112, ge=8, le=1200)
    rotation: int = Field(default=0, ge=-360, le=360)
    opacity: int = Field(default=100, ge=1, le=100)
    quantity: int = Field(default=1, ge=1, le=200)
    placement: Literal["random", "center"] = "random"
    seed: int | None = None


class PromptEnhanceRequest(BaseModel):
    """Corps de /api/prompt/enhance (prompt engineering video-to-video)."""

    text: str = Field(min_length=1, max_length=1000)
    model: Literal["kling", "luma", "decart", "generic"] = "kling"
    use_llm: bool = False
