"""Run the same offline quality gates locally and in CI."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def offline_environment():
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("AZURE_OPENAI_", "AZURE_SEARCH_", "COSMOS_DB_", "AUTH_"))}
    env.update(AGENTSENSE_MODE="demo", AGENTSENSE_AUTH_MODE="local-demo", ENVIRONMENT="development",
               SESSION_RETENTION_HOURS="24", PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
    return env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=("backend", "frontend", "all"), default="all")
    args = parser.parse_args()
    commands = []
    if args.only in ("backend", "all"):
        commands.extend([
            [sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests", "-v"],
            [sys.executable, "-B", "test_e2e_scenario.py"],
            [sys.executable, "-B", "-m", "evals.run_evals"],
            [sys.executable, "-m", "pip", "check"],
        ])
    if args.only in ("frontend", "all"):
        npm = shutil.which("npm")
        if npm is None:
            parser.error("npm is required for frontend checks")
        commands.extend([[npm, "--prefix", "frontend", "run", "typecheck"],
                         [npm, "--prefix", "frontend", "run", "build"]])
    for command in commands:
        print("+ " + " ".join(command), flush=True)
        subprocess.run(command, cwd=ROOT, env=offline_environment(), check=True)


if __name__ == "__main__":
    main()
