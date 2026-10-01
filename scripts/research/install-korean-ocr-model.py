#!/usr/bin/env python3
"""Stage the pinned, free RapidOCR Korean recognizer in the ignored local model cache."""
import argparse
import hashlib
import os
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen


URL = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5/rec/korean_PP-OCRv5_rec_mobile.onnx"
SHA256 = "cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b"
ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / ".local/research/local-ai/ocr/models/korean_PP-OCRv5_rec_mobile.onnx"


def checksum(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def install(check=False):
    if TARGET.is_file() and checksum(TARGET) == SHA256:
        print(f"verified {TARGET.relative_to(ROOT)} sha256={SHA256}")
        return
    if check:
        raise SystemExit(f"missing or checksum mismatch: {TARGET}")

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".korean-ocr-", dir=TARGET.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            request = Request(URL, headers={"User-Agent": "tech-knowledge-garden/1"})
            with urlopen(request, timeout=60) as response:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        staged = Path(temporary)
        actual = checksum(staged)
        if actual != SHA256:
            raise ValueError(f"Korean OCR model checksum mismatch: {actual}")
        os.chmod(staged, 0o600)
        os.replace(staged, TARGET)
        print(f"installed {TARGET.relative_to(ROOT)} sha256={SHA256}")
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the local model without downloading")
    install(parser.parse_args().check)
