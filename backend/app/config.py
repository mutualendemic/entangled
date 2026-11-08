import os
import secrets


class Config:
    MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "entanglement")
    MONGODB_DNS_NAMESERVERS = (
        os.getenv("MONGODB_DNS_NAMESERVERS")
        or os.getenv("MONGODB_DNS_SERVERS")
        or "1.1.1.1,8.8.8.8"
    )
    MONGODB_DNS_SERVERS = [
        server.strip()
        for server in MONGODB_DNS_NAMESERVERS.split(",")
        if server.strip()
    ]
    JWT_SECRET = os.getenv("JWT_SECRET") or (
        secrets.token_urlsafe(48) if os.getenv("VERCEL") != "1" else ""
    )
    JWT_ACCESS_TOKEN_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "60"))
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
    APP_ORIGIN = os.getenv("APP_ORIGIN", "http://localhost:5173")
    EVENT_ID = os.getenv("EVENT_ID", "local-event")
    EVENT_ADMIN_TOKEN = os.getenv("EVENT_ADMIN_TOKEN", "")
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM = os.getenv("SMTP_FROM", "")
    SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"