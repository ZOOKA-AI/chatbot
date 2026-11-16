#!/usr/bin/env python3
"""Cut the background out of one image, keeping real alpha.

Run as a subprocess so a slow or crashed segmenter can never take the web process with it, and so the
model (which is hundreds of megabytes) is loaded in a short-lived process rather than held in memory
between requests.

Usage: remove_bg.py <input> <output.png> [model]
"""
import os
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: remove_bg.py <input> <output> [model]", file=sys.stderr)
        return 2
    source, destination = sys.argv[1], sys.argv[2]
    model = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("REMBG_MODEL", "u2net")
    try:
        from PIL import Image
        from rembg import new_session, remove
    except Exception as error:  # noqa: BLE001 - reported to the caller as a string
        print(f"engine import failed: {error}", file=sys.stderr)
        return 3
    try:
        image = Image.open(source)
        cut = remove(image, session=new_session(model))
        cut.save(destination, format="PNG")
    except Exception as error:  # noqa: BLE001
        print(f"background removal failed: {error}", file=sys.stderr)
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
