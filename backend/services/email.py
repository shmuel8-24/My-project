import os
import smtplib
import socket
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    import resend as _resend_mod
    _RESEND_OK = True
except ImportError:
    _resend_mod = None  # type: ignore[assignment]
    _RESEND_OK  = False


def _otp_email_html(code: str) -> str:
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>קוד אימות ל-U-Note</title>
</head>
<body style="margin:0;padding:0;background:#FBFBF9;
             font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="padding:52px 20px 56px;background:#FBFBF9;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0"
             style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:480px;
                    box-shadow:0 8px 48px rgba(107,144,74,0.12),0 2px 8px rgba(0,0,0,0.04);
                    border:1px solid rgba(138,171,106,0.18);">
        <tr>
          <td style="background:linear-gradient(145deg,#95B878 0%,#7D9E5E 100%);
                     padding:40px 32px 34px;text-align:center;">
            <div style="display:inline-block;width:52px;height:52px;
                        background:rgba(255,255,255,0.22);border-radius:14px;
                        border:1.5px solid rgba(255,255,255,0.40);
                        line-height:52px;text-align:center;margin-bottom:16px;">
              <span style="font-size:23px;font-weight:700;color:#ffffff;
                           font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                           letter-spacing:-0.5px;">U</span>
            </div>
            <h1 style="margin:0 0 7px;font-size:24px;font-weight:700;color:#ffffff;
                       letter-spacing:1.5px;">U-Note</h1>
            <p style="margin:0;font-size:13px;font-weight:300;
                      color:rgba(255,255,255,0.80);letter-spacing:0.4px;">
              שותף המחקר החכם שלך
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 38px 34px;background:#ffffff;">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#3D5228;line-height:1.5;">
              שלום &#127807;
            </p>
            <p style="margin:0 0 30px;font-size:15px;font-weight:400;color:#5A6E4A;line-height:1.85;">
              קיבלנו בקשה להיכנס ל&#8209;<strong style="color:#578038;font-weight:600;">U-Note</strong>.
              הקוד האישי שלך הוא:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:34px;">
              <tr><td align="center">
                <div style="display:inline-block;background:#8AAB6A;border-radius:50px;padding:18px 52px;
                            box-shadow:0 4px 28px rgba(138,171,106,0.42);">
                  <span style="font-size:40px;font-weight:700;letter-spacing:8px;color:#ffffff;
                               font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                    {code}
                  </span>
                </div>
              </td></tr>
            </table>
            <p style="margin:0 0 9px;font-size:13px;font-weight:400;color:#7A8E6A;line-height:1.7;">
              &#9201;&nbsp; הקוד בתוקף ל&#8209;<strong style="color:#4A6B30;font-weight:600;">10 דקות</strong> בלבד.
            </p>
            <p style="margin:0;font-size:12px;font-weight:300;color:#AABCA0;line-height:1.7;">
              לא ביקשת להיכנס? ניתן להתעלם מהודעה זו בבטחה &mdash; החשבון שלך שמור.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F5F8F2;padding:20px 38px;text-align:center;
                     border-top:1px solid rgba(138,171,106,0.16);">
            <p style="margin:0 0 3px;font-size:12px;font-weight:500;color:#8FAB78;letter-spacing:0.6px;">
              U-Note
            </p>
            <p style="margin:0;font-size:11px;font-weight:300;color:#B2C4A4;">
              שותף המחקר החכם שלך
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _reset_email_html(reset_link: str) -> str:
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>איפוס סיסמה ל-U-Note</title>
</head>
<body style="margin:0;padding:0;background:#FBFBF9;
             font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="padding:52px 20px 56px;background:#FBFBF9;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0"
             style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:480px;
                    box-shadow:0 8px 48px rgba(107,144,74,0.12),0 2px 8px rgba(0,0,0,0.04);
                    border:1px solid rgba(138,171,106,0.18);">
        <tr>
          <td style="background:linear-gradient(145deg,#95B878 0%,#7D9E5E 100%);
                     padding:40px 32px 34px;text-align:center;">
            <div style="display:inline-block;width:52px;height:52px;
                        background:rgba(255,255,255,0.22);border-radius:14px;
                        border:1.5px solid rgba(255,255,255,0.40);
                        line-height:52px;text-align:center;margin-bottom:16px;">
              <span style="font-size:23px;font-weight:700;color:#ffffff;
                           font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                           letter-spacing:-0.5px;">U</span>
            </div>
            <h1 style="margin:0 0 7px;font-size:24px;font-weight:700;color:#ffffff;
                       letter-spacing:1.5px;">U-Note</h1>
            <p style="margin:0;font-size:13px;font-weight:300;
                      color:rgba(255,255,255,0.80);letter-spacing:0.4px;">
              שותף המחקר החכם שלך
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 38px 34px;background:#ffffff;">
            <p style="margin:0 0 24px;font-size:17px;font-weight:600;color:#3D5228;line-height:1.5;">
              איפוס סיסמה &#128274;
            </p>
            <p style="margin:0 0 28px;font-size:15px;font-weight:400;color:#5A6E4A;line-height:1.85;">
              קיבלנו בקשה לאיפוס הסיסמה שלך ב&#8209;<strong style="color:#578038;font-weight:600;">U-Note</strong>.
              לחץ על הכפתור להמשך:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr><td align="center">
                <a href="{reset_link}"
                   style="display:inline-block;background:#8AAB6A;border-radius:12px;
                          padding:14px 40px;color:#ffffff;font-size:16px;font-weight:600;
                          text-decoration:none;box-shadow:0 4px 20px rgba(138,171,106,0.35);">
                  איפוס סיסמה
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 9px;font-size:13px;font-weight:400;color:#7A8E6A;line-height:1.7;">
              &#9201;&nbsp; הקישור בתוקף ל&#8209;<strong style="color:#4A6B30;font-weight:600;">30 דקות</strong> בלבד.
            </p>
            <p style="margin:0;font-size:12px;font-weight:300;color:#AABCA0;line-height:1.7;">
              לא ביקשת לאפס סיסמה? ניתן להתעלם מהודעה זו בבטחה.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F5F8F2;padding:20px 38px;text-align:center;
                     border-top:1px solid rgba(138,171,106,0.16);">
            <p style="margin:0 0 3px;font-size:12px;font-weight:500;color:#8FAB78;letter-spacing:0.6px;">
              U-Note
            </p>
            <p style="margin:0;font-size:11px;font-weight:300;color:#B2C4A4;">
              שותף המחקר החכם שלך
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _smtp_error_message(exc: Exception) -> str:
    msg = str(exc).lower()
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "אימות שרת המייל נכשל — בדוק את MAIL_USERNAME ו-MAIL_PASSWORD"
    if isinstance(exc, smtplib.SMTPConnectError):
        return "לא ניתן להתחבר לשרת המייל — בדוק את MAIL_SERVER ו-MAIL_PORT"
    if isinstance(exc, ConnectionRefusedError):
        return "שרת המייל דחה את החיבור — בדוק שהפורט נכון (MAIL_PORT)"
    if isinstance(exc, (TimeoutError, socket.timeout)) or "timed out" in msg:
        return "החיבור לשרת המייל פג — ייתכן שהשרת לא מגיב"
    if isinstance(exc, ssl.SSLError) or "ssl" in msg or "certificate" in msg:
        return "שגיאת SSL/TLS — בדוק את MAIL_USE_TLS ו-MAIL_USE_SSL"
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return "שרת המייל דחה את כתובת הנמען"
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return "שרת המייל דחה את כתובת השולח — בדוק את MAIL_FROM"
    if isinstance(exc, smtplib.SMTPException):
        return f"שגיאת SMTP: {exc}"
    return f"שגיאה בשרת המייל: {exc}"


def _send_email_smtp(to_email: str, subject: str, html_body: str) -> None:
    mail_server   = os.getenv("MAIL_SERVER",   "").strip()
    mail_port_str = os.getenv("MAIL_PORT",     "587").strip()
    use_tls       = os.getenv("MAIL_USE_TLS",  "true").strip().lower()  in ("1", "true", "yes")
    use_ssl       = os.getenv("MAIL_USE_SSL",  "false").strip().lower() in ("1", "true", "yes")
    mail_username = os.getenv("MAIL_USERNAME", "").strip()
    mail_password = os.getenv("MAIL_PASSWORD", "").strip()
    mail_from     = os.getenv("MAIL_FROM",     "").strip() or mail_username

    if not all([mail_server, mail_username, mail_password]):
        raise RuntimeError("SMTP לא מוגדר — הוסף MAIL_SERVER, MAIL_USERNAME, MAIL_PASSWORD ל-.env")
    try:
        mail_port = int(mail_port_str)
    except ValueError:
        raise RuntimeError(f"MAIL_PORT חייב להיות מספר — קיבלנו: {mail_port_str!r}")

    msg = MIMEMultipart("alternative")
    msg["From"]    = mail_from
    msg["To"]      = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    print(f"[SMTP] Sending to {to_email} via {mail_server}:{mail_port} (SSL={use_ssl}, STARTTLS={use_tls})")
    try:
        if use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(mail_server, mail_port, context=ctx, timeout=15) as smtp:
                smtp.login(mail_username, mail_password)
                smtp.sendmail(mail_username, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(mail_server, mail_port, timeout=15) as smtp:
                smtp.ehlo()
                if use_tls:
                    smtp.starttls()
                    smtp.ehlo()
                smtp.login(mail_username, mail_password)
                smtp.sendmail(mail_username, [to_email], msg.as_string())
        print(f"[SMTP] ✓ Delivered to {to_email}")
    except Exception as exc:
        user_msg = _smtp_error_message(exc)
        print(f"[SMTP] ✗ {type(exc).__name__}: {exc}")
        raise RuntimeError(user_msg) from exc


def send_otp_email(to_email: str, code: str) -> None:
    """Send OTP email. Raises RuntimeError (Hebrew) if a configured provider fails."""
    subject = "קוד האימות שלך ל-U-Note"
    html    = _otp_email_html(code)

    if os.getenv("MAIL_SERVER", "").strip():
        _send_email_smtp(to_email, subject, html)
        return

    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key and _RESEND_OK and _resend_mod is not None:
        try:
            _resend_mod.api_key = resend_key
            _resend_mod.Emails.send({
                "from":    "U-Note <onboarding@resend.dev>",
                "to":      [to_email],
                "subject": subject,
                "html":    html,
            })
            print(f"[Resend] OTP delivered to {to_email}")
            return
        except Exception as exc:
            print(f"[Resend] ✗ {type(exc).__name__}: {exc}")
            raise RuntimeError(f"שגיאת Resend בשליחת המייל: {exc}") from exc

    print(f"\n{'─'*58}")
    print(f"  [DEV-OTP]  To  : {to_email}")
    print(f"  [DEV-OTP]  Code: {code}  (valid 10 min)")
    print(f"  Configure MAIL_SERVER (SMTP) or RESEND_API_KEY to send real emails.")
    print(f"{'─'*58}\n")


def send_reset_email(to_email: str, reset_link: str) -> None:
    """Send password-reset email. Raises RuntimeError (Hebrew) if a configured provider fails."""
    subject = "איפוס סיסמה ל-U-Note"
    html    = _reset_email_html(reset_link)

    if os.getenv("MAIL_SERVER", "").strip():
        _send_email_smtp(to_email, subject, html)
        return

    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key and _RESEND_OK and _resend_mod is not None:
        try:
            _resend_mod.api_key = resend_key
            _resend_mod.Emails.send({
                "from":    "U-Note <onboarding@resend.dev>",
                "to":      [to_email],
                "subject": subject,
                "html":    html,
            })
            print(f"[Resend] Reset email delivered to {to_email}")
            return
        except Exception as exc:
            print(f"[Resend] ✗ {type(exc).__name__}: {exc}")
            raise RuntimeError(f"שגיאת Resend בשליחת המייל: {exc}") from exc

    print(f"\n{'─'*58}")
    print(f"  [DEV-RESET]  To  : {to_email}")
    print(f"  [DEV-RESET]  Link: {reset_link}")
    print(f"  [DEV-RESET]  Expires in 30 min")
    print(f"  Configure MAIL_SERVER (SMTP) or RESEND_API_KEY to send real emails.")
    print(f"{'─'*58}\n")
