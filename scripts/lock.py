"""Generate pip-compatible universal requirements with strong SHA256 hashes only."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def strong_hashes(text):
    records = []
    for record in text.replace("\\\n", "").splitlines():
        if not record.strip():
            continue
        requirement = record.partition("--hash=")[0].strip()
        hashes = re.findall(r"--hash=([a-z0-9]+):([a-f0-9]+)", record)
        if any(algorithm not in ("md5", "sha256") for algorithm, _ in hashes):
            raise ValueError("Unexpected lock hash algorithm; review the generator output.")
        strong = sorted({digest for algorithm, digest in hashes if algorithm == "sha256" and len(digest) == 64})
        if not requirement or not strong:
            raise ValueError("Every locked requirement must have a SHA256 distribution hash.")
        lines = [requirement] + ["    --hash=sha256:" + digest for digest in strong]
        records.append(" \\\n".join(lines))
    if not records:
        raise ValueError("Dependency resolution produced an empty lock.")
    return "\n".join(records) + "\n"


def compile_lock(output):
    subprocess.run([
        sys.executable, "-m", "uv", "pip", "compile", "requirements.txt",
        "--universal", "--python-version", "3.12", "--generate-hashes", "--no-header", "--no-annotate",
        "--output-file", str(output),
    ], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    # Some package mirrors advertise MD5 alongside SHA256; pip --require-hashes rejects MD5.
    output.write_text(strong_hashes(output.read_text()), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    compile_lock(ROOT / "requirements.lock")
