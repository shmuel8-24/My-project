#!/usr/bin/env python3
"""Unified startup script — runs Flask backend and Next.js frontend in parallel."""

import os
import signal
import subprocess
import sys
import threading
from pathlib import Path


BLUE  = "\033[94m"
GREEN = "\033[92m"
BOLD  = "\033[1m"
RESET = "\033[0m"

ROOT         = Path(__file__).parent
BACKEND_DIR  = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

# Ensure /usr/local/bin is on PATH so npm/node are found (required on macOS)
env = os.environ.copy()
env["PATH"] = f"/usr/local/bin:{env.get('PATH', '')}"


def stream_output(stream, label, color):
    """Read lines from a stream and print them with a colored, fixed-width label."""
    try:
        for line in stream:
            sys.stdout.write(f"{color}{BOLD}{label}{RESET} {line}")
            sys.stdout.flush()
    except ValueError:
        pass  # pipe closed after process exit


def start_process(cmd, cwd, label, color):
    """Spawn a subprocess and start daemon threads to forward its stdout/stderr."""
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
        preexec_fn=os.setsid,  # new session → lets us kill the whole process group
    )
    for stream in (proc.stdout, proc.stderr):
        threading.Thread(
            target=stream_output,
            args=(stream, label, color),
            daemon=True,
        ).start()
    return proc


def kill_group(proc):
    """Send SIGTERM to the process group; escalate to SIGKILL after 5 s."""
    if proc.poll() is not None:
        return
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGTERM)
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    except (ProcessLookupError, PermissionError):
        pass


def main():
    print(f"\n{BOLD}Starting U-Note{RESET}")
    print(f"  {BLUE}{BOLD}[BACKEND] {RESET} Flask   → http://localhost:5003")
    print(f"  {GREEN}{BOLD}[FRONTEND]{RESET} Next.js → http://localhost:3000\n")

    # Prefer the venv Python so backend deps are available without activation
    venv_python = BACKEND_DIR / ".venv" / "bin" / "python"
    python_cmd  = str(venv_python) if venv_python.exists() else "python"

    backend  = start_process([python_cmd, "app.py"], BACKEND_DIR,  "[BACKEND] ", BLUE)
    frontend = start_process(["npm", "run", "dev"],  FRONTEND_DIR, "[FRONTEND]", GREEN)

    # stop_event is set when either process exits unexpectedly OR on Ctrl+C
    stop_event = threading.Event()

    def watch(proc, name):
        proc.wait()
        if not stop_event.is_set():
            print(f"\n{BOLD}{name} exited (code {proc.returncode}). Shutting down...{RESET}")
            stop_event.set()

    for proc, name in [(backend, "Backend"), (frontend, "Frontend")]:
        threading.Thread(target=watch, args=(proc, name), daemon=True).start()

    try:
        stop_event.wait()   # block until a process dies or Ctrl+C is pressed
    except KeyboardInterrupt:
        pass

    print(f"\n{BOLD}Shutting down...{RESET}")
    stop_event.set()
    kill_group(backend)
    kill_group(frontend)
    print("Done.")


if __name__ == "__main__":
    main()
