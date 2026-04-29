"""
KuraNote — Agentic AI CRM for Students
CrewAI × Telegram Webhook (Flask)
"""

import os
import logging
import threading
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from crewai import Agent, Task, Crew, Process, LLM

load_dotenv()

# ── LOGGING ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ── ENVIRONMENT ───────────────────────────────────────────────────────────────

OPENAI_API_KEY        = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL          = os.getenv("OPENAI_MODEL", "gpt-4o")
PORT                  = int(os.getenv("PORT", 5000))
WEBHOOK_URL           = os.getenv("WEBHOOK_URL")               # e.g. https://yourdomain.com

TELEGRAM_TOKEN        = os.getenv("TELEGRAM_TOKEN")            # Conor (CEO)  — main bot
TELEGRAM_TOKEN_VISION = os.getenv("TELEGRAM_TOKEN_VISION")     # Luke  (Vision & Brand)
TELEGRAM_TOKEN_CTO    = os.getenv("TELEGRAM_TOKEN_CTO")        # Indiana (CTO)
TELEGRAM_TOKEN_LEGAL  = os.getenv("TELEGRAM_TOKEN_LEGAL")      # Saul  (Legal)
TELEGRAM_TOKEN_CMO    = os.getenv("TELEGRAM_TOKEN_CMO")        # Ted   (CMO)
TELEGRAM_TOKEN_CFO    = os.getenv("TELEGRAM_TOKEN_CFO")        # Kobe  (CFO)

# ── FLASK APP ─────────────────────────────────────────────────────────────────

app = Flask(__name__)

# ── LLM ───────────────────────────────────────────────────────────────────────

llm = LLM(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, temperature=0.7)

# ── AGENT OUTPUT RULES ────────────────────────────────────────────────────────

AGENT_RULES = (
    "חוקי ברזל — אין עליהם ויכוח:\n"
    "• כתוב אך ורק בעברית.\n"
    "• אל תפתח עם ברכה ('שלום', 'היי', 'אהלן', 'ברוך הבא').\n"
    "• אל תסיים עם חתימה, פרידה, שמך, או 'בברכה'.\n"
    "• אל תציין את שמך בשום מקום — לא בהתחלה, לא באמצע.\n"
    "• אסור לפתוח עם כותרת תפקיד כמו 'CEO:' או 'CFO:' או 'כ-CEO:'.\n"
    "• ענה ישירות על הבקשה מהזווית של התפקיד שלך בלבד.\n"
    "• קצר, חד, actionable — ישיר כמו כדור."
)

# ── TELEGRAM HELPERS ─────────────────────────────────────────────────────────

_TG_LIMIT = 4096


def send_telegram_message(token: str, chat_id: int, text: str) -> None:
    """Send text to a Telegram chat using the specified bot token."""
    if not token:
        logger.warning("send_telegram_message: missing token, skipping.")
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    chunks = [text[i : i + _TG_LIMIT] for i in range(0, max(len(text), 1), _TG_LIMIT)]
    for chunk in chunks:
        try:
            resp = requests.post(
                url,
                json={"chat_id": chat_id, "text": chunk},
                timeout=15,
            )
            resp.raise_for_status()
        except Exception as exc:
            logger.error(f"Telegram send error (token=…{token[-6:]}): {exc}")


def make_task_callback(token: str, chat_id: int):
    """
    Factory: returns a CrewAI task callback that broadcasts the finished
    task output to Telegram using the given agent-specific token.
    """
    def _cb(task_output):
        raw = getattr(task_output, "raw", None) or str(task_output)
        send_telegram_message(token, chat_id, raw)
    return _cb


# ── WEBHOOK REGISTRATION ──────────────────────────────────────────────────────

def register_webhook() -> None:
    """Register this server's /webhook endpoint with Telegram on startup."""
    if not WEBHOOK_URL:
        logger.warning("WEBHOOK_URL not set — Telegram webhook not registered.")
        return
    endpoint = f"{WEBHOOK_URL.rstrip('/')}/webhook"
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook"
    try:
        resp = requests.post(url, json={"url": endpoint}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("ok"):
            logger.info(f"Telegram webhook registered: {endpoint}")
        else:
            logger.error(f"Webhook registration failed: {data}")
    except Exception as exc:
        logger.error(f"Could not register webhook: {exc}")


# ── CREW FACTORY ──────────────────────────────────────────────────────────────

def build_crew(chat_id: int) -> Crew:
    """
    Builds a fresh Crew per request so each agent's callback is bound to
    the correct chat_id and its own, non-overlapping Telegram token.

    {user_request} in task descriptions is a CrewAI template variable —
    substituted at kickoff() time via crew.kickoff(inputs={"user_request": ...}).
    The lines containing {user_request} have no f-prefix, so Python leaves
    the placeholder literal for CrewAI to resolve.
    """

    # ─── Agents ────────────────────────────────────────────────────────────

    conor = Agent(
        role="CEO",
        goal=(
            "להוביל את KuraNote ל-product-market fit ב-EdTech תוך 6 חודשים. "
            "לקבל החלטות אסטרטגיות מהירות, נועזות, ו-data-driven."
        ),
        backstory=(
            "קונור מקגרגור של עולם ה-B2B SaaS. שני exits ו-$30M seed מאחוריי. "
            "MVP שיוצא השבוע שווה יותר מ-perfect product שיוצא בשנה הבאה. "
            "KuraNote בונה AI CRM שלומד את סגנון הכתיבה של הסטודנט — "
            "ה-whitespace הכי גדול שראיתי ב-EdTech.\n\n"
            f"{AGENT_RULES}"
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )

    luke = Agent(
        role="VP Vision & Brand",
        goal=(
            "לבנות את ה-brand של KuraNote כך שסטודנטים ירגישו שהפלטפורמה 'מבינה אותם'. "
            "לעצב UX שמוריד friction לאפס ויוצר emotional hook חזק."
        ),
        backstory=(
            "לוק סקייווקר של UX design ו-brand strategy. רקע ב-IDEO ו-Figma. "
            "הסטודנט לא רוצה tool — הוא רוצה copilot שמכיר אותו אישית. "
            "המשימה שלי: KuraNote תרגיש כמו חבר חכם, לא GPT wrapper אנונימי.\n\n"
            f"{AGENT_RULES}"
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )

    indiana = Agent(
        role="CTO",
        goal=(
            "לבנות RAG pipeline שלומד את סגנון הכתיבה הייחודי של כל סטודנט. "
            "Scale ל-100K concurrent users בלי לשבור את ה-bank."
        ),
        backstory=(
            "אינדיאנה ג'ונס של ה-AI engineering. 5 שנים ב-Pinecone, "
            "3 שנים building production RAG systems — ראיתי הכל להתפרק ב-scale. "
            "ה-tech stack חייב להיות modular, cheap-to-run, ו-production-ready. "
            "אם זה לא עובד ב-72 שעות — זה לא קורה.\n\n"
            f"{AGENT_RULES}"
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )

    saul = Agent(
        role="Legal Counsel",
        goal=(
            "לזהות סיכונים משפטיים ב-EdTech AI ולבנות הגנות שמאפשרות ל-KuraNote לפעול חופשי. "
            "לשמור על ה-IP ולמנוע חשיפה לתביעות academic integrity."
        ),
        backstory=(
            "סול גודמן של ה-EdTech legal world. עבדתי עם Chegg, Course Hero ו-Coursera לפני IPO. "
            "מומחה ב-FERPA, GDPR, academic integrity frameworks, AI disclosure laws. "
            "Better call Saul לפני כל feature launch — לא אחרי.\n\n"
            f"{AGENT_RULES}"
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )

    ted = Agent(
        role="CMO",
        goal=(
            "לחדור ל-50 קמפוסים תוך שנה עם CAC מתחת ל-$10 per student. "
            "לבנות viral loops ו-campus ambassador programs שמביאים growth אורגני."
        ),
        backstory=(
            "טד לאסו של ה-growth marketing. "
            "בניתי bottom-up SaaS growth מ-3 קמפוסים ל-200 תוך 18 חודשים. "
            "ה-best CAC תמיד מגיע מ-TA שממליץ באורגני. "
            "מתמחה ב-PLG, community-led growth, campus infiltration playbooks.\n\n"
            f"{AGENT_RULES}"
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )

    kobe = Agent(
        role="CFO",
        goal=(
            "לשמור על runway של 18+ חודשים ולמקסם ROI על כל דולר שיוצא. "
            "Unit economics tight ו-LLM token costs תחת שליטה מלאה."
        ),
        backstory=(
            "קובי בראיינט של ה-financial modeling. Mamba mentality לכל שקל ולכל token. "
            "5 שנות VP Finance ב-AI startups שרצו מהר מדי ונשרפו. "
            "ה-biggest hidden cost ב-AI SaaS הוא LLM API calls — "
            "כל feature חייב להצדיק ROI לפני שהוא נכנס ל-roadmap.\n\n"
            f"{AGENT_RULES}"
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )

    # ─── Callbacks — strict token-to-agent mapping, never swapped ──────────

    cb_conor   = make_task_callback(TELEGRAM_TOKEN,         chat_id)  # Conor   → CEO token
    cb_luke    = make_task_callback(TELEGRAM_TOKEN_VISION,   chat_id)  # Luke    → VISION token
    cb_indiana = make_task_callback(TELEGRAM_TOKEN_CTO,      chat_id)  # Indiana → CTO token
    cb_saul    = make_task_callback(TELEGRAM_TOKEN_LEGAL,    chat_id)  # Saul    → LEGAL token
    cb_ted     = make_task_callback(TELEGRAM_TOKEN_CMO,      chat_id)  # Ted     → CMO token
    cb_kobe    = make_task_callback(TELEGRAM_TOKEN_CFO,      chat_id)  # Kobe    → CFO token

    # ─── Tasks — {user_request} substituted by crew.kickoff(inputs=...) ────

    task_conor = Task(
        description=(
            f"{AGENT_RULES}\n\n"
            "הבקשה: {user_request}\n\n"
            "ענה כ-CEO של KuraNote: נתח אסטרטגית. "
            "מה ה-priority? מה ה-GTM angle? מה קורה אם לא נפעל עכשיו? "
            "תהיה ישיר ו-opinionated. אין זמן לאמביוולנטיות."
        ),
        expected_output=(
            "ניתוח CEO קצר וחד בעברית — strategic call, top priority, immediate next action. "
            "ללא כותרות, ללא שם, ללא ברכות."
        ),
        agent=conor,
        callback=cb_conor,
    )

    task_luke = Task(
        description=(
            f"{AGENT_RULES}\n\n"
            "הבקשה: {user_request}\n\n"
            "ענה כ-VP Vision & Brand של KuraNote: נתח מזווית UX ו-brand. "
            "מה הפסיכולוגיה של הסטודנט כאן? מה ה-emotional hook? "
            "מה ה-brand message שיגרום לסטודנט להרגיש 'זה בדיוק בשבילי'?"
        ),
        expected_output=(
            "ניתוח Vision & Brand בעברית — student psychology, UX reco, brand angle. "
            "ללא כותרות, ללא שם, ללא ברכות."
        ),
        agent=luke,
        callback=cb_luke,
    )

    task_indiana = Task(
        description=(
            f"{AGENT_RULES}\n\n"
            "הבקשה: {user_request}\n\n"
            "ענה כ-CTO של KuraNote: נתח מזווית טכנולוגית. "
            "מה ה-RAG architecture implications? מה ה-implementation path? "
            "מה ה-scaling considerations? "
            "איך זה מתחבר ל-style learning pipeline של הסטודנט?"
        ),
        expected_output=(
            "ניתוח CTO בעברית — architecture, implementation approach, scaling plan. "
            "ללא כותרות, ללא שם, ללא ברכות."
        ),
        agent=indiana,
        callback=cb_indiana,
    )

    task_saul = Task(
        description=(
            f"{AGENT_RULES}\n\n"
            "הבקשה: {user_request}\n\n"
            "ענה כ-Legal Counsel של KuraNote: נתח מזווית משפטית. "
            "מה הסיכונים? FERPA? GDPR? academic integrity exposure? IP risk? "
            "מה ה-terms of service שצריך? איך מגנים על KuraNote?"
        ),
        expected_output=(
            "ניתוח Legal בעברית — risk map, regulatory concerns, protective recommendations. "
            "ללא כותרות, ללא שם, ללא ברכות."
        ),
        agent=saul,
        callback=cb_saul,
    )

    task_ted = Task(
        description=(
            f"{AGENT_RULES}\n\n"
            "הבקשה: {user_request}\n\n"
            "ענה כ-CMO של KuraNote: נתח מזווית growth ו-marketing. "
            "מה ה-campus infiltration angle? איך ממנפים זה ל-viral growth? "
            "מה ה-CAC impact? מה ה-ambassador program play?"
        ),
        expected_output=(
            "ניתוח CMO בעברית — growth angle, campus tactic, viral mechanics. "
            "ללא כותרות, ללא שם, ללא ברכות."
        ),
        agent=ted,
        callback=cb_ted,
    )

    task_kobe = Task(
        description=(
            f"{AGENT_RULES}\n\n"
            "הבקשה: {user_request}\n\n"
            "ענה כ-CFO של KuraNote: נתח מזווית פיננסית. "
            "מה העלויות? token costs? infrastructure overhead? "
            "מה ה-ROI הצפוי? מה ה-impact על burn rate ו-runway? "
            "תן go/no-go recommendation פיננסי."
        ),
        expected_output=(
            "ניתוח CFO בעברית — cost breakdown, ROI, go/no-go financial verdict. "
            "ללא כותרות, ללא שם, ללא ברכות."
        ),
        agent=kobe,
        callback=cb_kobe,
    )

    return Crew(
        agents=[conor, luke, indiana, saul, ted, kobe],
        tasks=[task_conor, task_luke, task_indiana, task_saul, task_ted, task_kobe],
        process=Process.sequential,
        memory=True,
        verbose=True,
        embedder={
            "provider": "openai",
            "config": {
                "model": "text-embedding-3-small",
                "api_key": OPENAI_API_KEY,
            },
        },
    )


# ── CREW RUNNER ───────────────────────────────────────────────────────────────

def run_crew(user_request: str, chat_id: int) -> None:
    """Build and run the crew. Called in a background thread so Flask stays fast."""
    try:
        crew = build_crew(chat_id=chat_id)
        crew.kickoff(inputs={"user_request": user_request})
        logger.info(f"[chat={chat_id}] Crew run complete.")
    except Exception as exc:
        logger.exception(f"[chat={chat_id}] Crew run failed")
        send_telegram_message(TELEGRAM_TOKEN, chat_id, f"⚠️ שגיאה פנימית: {exc}")


# ── FLASK ROUTES ──────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "KuraNote Crew Bot"}), 200


@app.route("/webhook", methods=["POST"])
def webhook():
    update = request.get_json(force=True, silent=True)
    if not update:
        return "ok", 200

    message = update.get("message", {})
    if not message:
        return "ok", 200

    chat_id = message.get("chat", {}).get("id")
    text    = message.get("text", "").strip()

    if not chat_id or not text:
        return "ok", 200

    if text == "/start":
        send_telegram_message(TELEGRAM_TOKEN, chat_id, "הצוות מוכן. שלח שאלה.")
        return "ok", 200

    if text.startswith("/"):
        return "ok", 200

    logger.info(f"[chat={chat_id}] Incoming: {text[:80]!r}")

    # Crew runs in a background thread — Telegram requires a fast 200 response.
    threading.Thread(target=run_crew, args=(text, chat_id), daemon=True).start()
    return "ok", 200


# ── STARTUP VALIDATION ────────────────────────────────────────────────────────

def _validate_env() -> None:
    required = {
        "OPENAI_API_KEY":        OPENAI_API_KEY,
        "TELEGRAM_TOKEN":        TELEGRAM_TOKEN,
        "TELEGRAM_TOKEN_VISION": TELEGRAM_TOKEN_VISION,
        "TELEGRAM_TOKEN_CTO":    TELEGRAM_TOKEN_CTO,
        "TELEGRAM_TOKEN_LEGAL":  TELEGRAM_TOKEN_LEGAL,
        "TELEGRAM_TOKEN_CMO":    TELEGRAM_TOKEN_CMO,
        "TELEGRAM_TOKEN_CFO":    TELEGRAM_TOKEN_CFO,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        raise SystemExit(
            f"Missing required env vars: {', '.join(missing)}\n"
            "Add them to your .env file."
        )


# ── ENTRY POINT ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _validate_env()
    register_webhook()
    app.run(host="0.0.0.0", port=PORT, threaded=True)
