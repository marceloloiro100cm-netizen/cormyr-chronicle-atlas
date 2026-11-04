#!/usr/bin/env python3
"""Import the last five public Drive spy portraits as optimized local JPEG assets.

Run in CI on the dedicated import branch. Verify each original is a real image,
not a Drive login/virus-check page, before accepting the downloaded bytes.
Preserves each composition without cropping or adding text.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import time

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

DESTINATION = Path("public/spy-portraits")
PORTRAITS = {
    "tillet": "17SXFn87QQIvsjauiFYRWWIVdk4IiXkcQ",
    "cortesa": "15jcdLz8R1bkofUK_X8uvIR4cSOPBl2ng",
    "vigia": "1roVx_sdr7BCchzPs_CleJvwH2iVZvLNK",
    "guarda": "1wM1JWqE8w_tjxwre1QtHS_-7SEEVVwWs",
    "ladrao": "1dwtaJHBRq8t4RGuVr3-CWVUDtopxmz9j",
}
MAX_SIZE = (1600, 2200)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Cormyr-Atlas-Portrait-Import/1.0)"}


def load_image(session: requests.Session, file_id: str) -> Image.Image:
    urls = (
        f"https://drive.google.com/uc?export=download&id={file_id}",
        f"https://drive.google.com/thumbnail?id={file_id}&sz=w2200",
        f"https://lh3.googleusercontent.com/d/{file_id}=w2200",
    )
    errors: list[str] = []
    for url in urls:
        try:
            response = session.get(url, timeout=75, allow_redirects=True)
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" in content_type:
                raise ValueError("Received HTML rather than a photograph")
            with Image.open(BytesIO(response.content)) as original:
                original.verify()
            with Image.open(BytesIO(response.content)) as original:
                image = ImageOps.exif_transpose(original).convert("RGB")
                if min(image.size) < 500:
                    raise ValueError(f"Low-resolution image: {image.size}")
                return image
        except (requests.RequestException, ValueError, UnidentifiedImageError, OSError) as exc:
            errors.append(f"{url.split('?')[0]}: {exc}")
            time.sleep(1)
    raise RuntimeError(f"Cannot download verified image {file_id}: {'; '.join(errors)}")


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    with requests.Session() as session:
        session.headers.update(HEADERS)
        for name, file_id in PORTRAITS.items():
            dest = DESTINATION / f"{name}.jpg"
            image = load_image(session, file_id)
            image.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
            image.save(dest, format="JPEG", quality=85, optimize=True, progressive=True)
            with Image.open(dest) as check:
                check.verify()
            print(f"Imported {dest}: {image.width}x{image.height}, {dest.stat().st_size} bytes")


if __name__ == "__main__":
    main()
