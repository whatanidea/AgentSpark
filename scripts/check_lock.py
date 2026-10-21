"""Check that the universal hash lock matches the direct requirements without upgrading it."""
from pathlib import Path
import shutil
import tempfile
from lock import compile_lock

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix="agentsense-lock-") as directory:
        candidate = Path(directory) / "requirements.lock"
        shutil.copyfile(ROOT / "requirements.lock", candidate)
        compile_lock(candidate)
        if candidate.read_bytes() != (ROOT / "requirements.lock").read_bytes():
            raise SystemExit("requirements.lock is stale. Regenerate it with the documented uv command.")
    print("Dependency lock is current.")


if __name__ == "__main__":
    main()
