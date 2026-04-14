"""Internationalization: string catalogs for emails and backend messages.

Each catalog is a dict keyed by language code. Default language is "de".
Add new languages by extending the dicts.
"""

DEFAULT_LANG = "de"
SUPPORTED_LANGS = ("de", "en")


def get_lang(lang: str | None) -> str:
    if lang and lang.lower()[:2] in SUPPORTED_LANGS:
        return lang.lower()[:2]
    return DEFAULT_LANG


# ---------------------------------------------------------------------------
# Email strings
# ---------------------------------------------------------------------------

EMAIL_STRINGS: dict[str, dict[str, str]] = {
    "de": {
        # Common
        "greeting": "Hallo",
        "footer": "— Mampfi",
        # Verify email
        "verify_subject": "Bestätige dein Mampfi-Konto",
        "verify_body": "Klicke auf den Link, um deine E-Mail-Adresse zu bestätigen:",
        "verify_cta": "E-Mail bestätigen",
        "verify_fallback": "Falls der Button nicht funktioniert, kopiere diesen Link:",
        "verify_expiry": "Dieser Link ist 24 Stunden gültig.",
        # Password reset
        "reset_subject": "Mampfi-Passwort zurücksetzen",
        "reset_body": "Klicke auf den Link, um dein Passwort zurückzusetzen:",
        "reset_cta": "Passwort zurücksetzen",
        "reset_fallback": "Falls der Button nicht funktioniert, kopiere diesen Link:",
        "reset_expiry": "Dieser Link ist 1 Stunde gültig.",
        "reset_ignore": "Falls du das nicht angefordert hast, ignoriere diese E-Mail.",
        # Payment notifications
        "payment_created_subject": "Neue Zahlung in {event_name}",
        "payment_created_body": "{from_name} hat eine Zahlung über {amount} an dich erstellt.",
        "payment_created_cta": "Zahlung ansehen",
        "payment_confirmed_subject": "Zahlung bestätigt in {event_name}",
        "payment_confirmed_body": "Deine Zahlung über {amount} an {to_name} wurde bestätigt.",
        "purchase_finalized_subject": "Einkauf abgeschlossen für {date}",
        "purchase_finalized_body": "{buyer_name} hat den Einkauf für {date} abgeschlossen. Gesamtsumme: {total}.",
        # Invite email
        "invite_subject": "Einladung zu {event_name} auf Mampfi",
        "invite_body": "{from_name} hat dich zu {event_name} auf Mampfi eingeladen. Klicke auf den Link, um beizutreten:",
        "invite_cta": "Einladung annehmen",
        "invite_fallback": "Falls der Button nicht funktioniert, kopiere diesen Link:",
        "invite_expiry": "Diese Einladung ist 14 Tage gültig.",
        # Event deletion
        "event_deleted_subject": "{event_name} wurde gelöscht",
        "event_deleted_body": 'Das Event "{event_name}" wurde von {deleter} gelöscht.\n\n{status}',
        "event_deleted_settled": "Alle Zahlungen waren ausgeglichen.",
        "event_deleted_balances": "Zahlungsstatus aller Mitglieder:",
    },
    "en": {
        # Common
        "greeting": "Hi",
        "footer": "— Mampfi",
        # Verify email
        "verify_subject": "Verify your Mampfi account",
        "verify_body": "Click the link below to verify your email address:",
        "verify_cta": "Verify email",
        "verify_fallback": "If the button doesn't work, copy this link:",
        "verify_expiry": "This link expires in 24 hours.",
        # Password reset
        "reset_subject": "Reset your Mampfi password",
        "reset_body": "Click the link below to reset your password:",
        "reset_cta": "Reset password",
        "reset_fallback": "If the button doesn't work, copy this link:",
        "reset_expiry": "This link expires in 1 hour.",
        "reset_ignore": "If you didn't request this, ignore this email.",
        # Payment notifications
        "payment_created_subject": "New payment in {event_name}",
        "payment_created_body": "{from_name} created a payment of {amount} to you.",
        "payment_created_cta": "View payment",
        "payment_confirmed_subject": "Payment confirmed in {event_name}",
        "payment_confirmed_body": "Your payment of {amount} to {to_name} was confirmed.",
        "purchase_finalized_subject": "Purchase finalized for {date}",
        "purchase_finalized_body": "{buyer_name} finalized the purchase for {date}. Total: {total}.",
        # Invite email
        "invite_subject": "Invitation to {event_name} on Mampfi",
        "invite_body": "{from_name} invited you to {event_name} on Mampfi. Click the link to join:",
        "invite_cta": "Accept invitation",
        "invite_fallback": "If the button doesn't work, copy this link:",
        "invite_expiry": "This invitation expires in 14 days.",
        # Event deletion
        "event_deleted_subject": "{event_name} was deleted",
        "event_deleted_body": 'The event "{event_name}" was deleted by {deleter}.\n\n{status}',
        "event_deleted_settled": "All payments were settled.",
        "event_deleted_balances": "Balance status of all members:",
    },
}


def t(key: str, lang: str | None = None, **kwargs: str) -> str:
    """Look up a translated string, with optional format substitution."""
    resolved = get_lang(lang)
    strings = EMAIL_STRINGS.get(resolved, EMAIL_STRINGS[DEFAULT_LANG])
    template = strings.get(key) or EMAIL_STRINGS[DEFAULT_LANG].get(key, key)
    return template.format(**kwargs) if kwargs else template
