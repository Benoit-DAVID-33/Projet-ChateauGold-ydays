"""Modeles Pydantic : validation et typage des corps de requete JSON.

Pydantic v2 (coeur Rust) valide et borne les entrees avant tout appel reseau,
ce qui evite les payloads malformes ou abusifs.
"""

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
