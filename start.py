#!/usr/bin/env python3
"""Unified startup script — runs Flask backend and Next.js frontend in parallel."""


import os
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path


BLUE  = "\033[94m"
GREEN = "\033[92m"
BOLD  = "\033[1m"
RESET = "\033[0m"
WARN  = "\033[93m"

ROOT         = Path(__file__).parent
BACKEND_DIR  = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

# Ensure /usr/local/bin is on PATH so npm/node are found (required on macOS)
env = os.environ.copy()
env["PATH"] = f"/usr/local/bin:{env.get('PATH', '')}"

# Enable Flask development mode so Werkzeug's file-watcher reloads the server
# automatically whenever backend source files change — no manual restart needed.
env["FLASK_ENV"]   = "development"
env["FLASK_DEBUG"] = "1"


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def free_port(port: int) -> None:
    """Kill any process listening on *port* (macOS/Linux: uses lsof)."""
    if not is_port_in_use(port):
        return
    print(f"{WARN}{BOLD}[startup] {RESET}Port {port} is in use — killing existing process…")
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True
        )
        pids = [p for p in result.stdout.strip().split() if p.isdigit()]
        for pid in pids:
            try:
                os.kill(int(pid), signal.SIGKILL)
                print(f"{WARN}{BOLD}[startup] {RESET}Killed PID {pid} on port {port}")
            except (ProcessLookupError, PermissionError):
                pass
        # Give the OS a moment to release the port
        for _ in range(10):
            time.sleep(0.5)
            if not is_port_in_use(port):
                break
    except FileNotFoundError:
        print(f"{WARN}{BOLD}[startup] {RESET}lsof not found — cannot auto-free port {port}")


def check_dir(path: Path, label: str) -> None:
    if not path.is_dir():
        sys.exit(
            f"\n{BOLD}ERROR:{RESET} {label} directory not found: {path}\n"
            "Make sure you are running start.py from the project root."
        )


def stream_output(stream, label, color):
    """Read lines from a stream and print them with a colored, fixed-width label."""
    try:
        for line in stream:
            sys.stdout.write(f"{color}{BOLD}{label}{RESE
            
            
            
            T} {line}")
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
    # Verify directories exist before attempting to launch anything
    check_dir(BACKEND_DIR,  "Backend")
    check_dir(FRONTEND_DIR, "Frontend")

    print(f"\n{BOLD}Starting U-Note{RESET}")
    print(f"  {BLUE}{BOLD}[BACKEND] {RESET} Flask   → http://localhost:5003")
    print(f"  {GREEN}{BOLD}[FRONTEND]{RESET} Next.js → http://localhost:3000\n")

    # Free ports before starting so stale processes don't cause EADDRINUSE
    free_port(3000)
    free_port(5003)

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
