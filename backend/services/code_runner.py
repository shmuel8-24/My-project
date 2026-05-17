import base64
import contextlib
import io
import threading
import traceback

import matplotlib
matplotlib.use("Agg")  # must be set before any pyplot import


def execute_python_code(code: str, timeout: int = 25) -> dict:
    result: dict = {"output": "", "error": None, "images": []}

    def _run() -> None:
        import math
        import matplotlib.pyplot as plt
        import numpy as np

        exec_globals: dict = {
            "__builtins__": __builtins__,
            "np": np, "numpy": np,
            "plt": plt, "matplotlib": matplotlib,
            "math": math,
        }
        try:
            import scipy
            import scipy.fft
            import scipy.integrate
            import scipy.linalg
            import scipy.optimize
            import scipy.signal
            import scipy.stats
            exec_globals.update({
                "scipy": scipy,
                "integrate": scipy.integrate,
                "optimize": scipy.optimize,
                "stats": scipy.stats,
                "linalg": scipy.linalg,
                "fft": scipy.fft,
            })
        except ImportError:
            pass

        stdout_buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(stdout_buf):
                exec(compile(code, "<code_interpreter>", "exec"), exec_globals)  # noqa: S102
        except Exception:
            result["error"] = traceback.format_exc()

        result["output"] = stdout_buf.getvalue()

        images: list[str] = []
        for fig_num in plt.get_fignums():
            buf = io.BytesIO()
            plt.figure(fig_num).savefig(
                buf, format="png", dpi=150,
                bbox_inches="tight", facecolor="white", edgecolor="none",
            )
            buf.seek(0)
            images.append(base64.b64encode(buf.read()).decode("utf-8"))
        plt.close("all")
        result["images"] = images

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    if thread.is_alive():
        result["error"] = f"Execution timed out after {timeout}s."
    return result
