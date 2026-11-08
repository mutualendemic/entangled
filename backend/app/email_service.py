import smtplib
from email.message import EmailMessage

from flask import current_app


def send_action_email(recipient: str, subject: str, action_url: str) -> bool:
    config = current_app.config
    if not all((config["SMTP_HOST"], config["SMTP_FROM"])):
        current_app.logger.warning("SMTP is not configured; action email was not sent")
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config["SMTP_FROM"]
    message["To"] = recipient
    message.set_content(
        "Use este link uma vez e dentro do prazo informado para concluir a solicitacao:\n\n"
        f"{action_url}\n"
    )

    with smtplib.SMTP(config["SMTP_HOST"], config["SMTP_PORT"], timeout=10) as server:
        if config["SMTP_USE_TLS"]:
            server.starttls()
        if config["SMTP_USERNAME"]:
            server.login(config["SMTP_USERNAME"], config["SMTP_PASSWORD"])
        server.send_message(message)

    return True