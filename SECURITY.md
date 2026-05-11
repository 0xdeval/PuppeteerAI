# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately.

- Email: `security@example.com` (replace with your project security contact)
- Include affected endpoint(s), reproduction steps, and impact assessment.
- Do not open public GitHub issues for unpatched vulnerabilities.

We will acknowledge receipt and coordinate disclosure after validation and patching.

## Secret Handling Guidance

- Never commit real API keys, cookies, or bearer tokens.
- Treat `API_SECRET`, `LLM_API_KEY`, `DOLPHIN_API_TOKEN`, and exported cookies as sensitive.
- Use `.env.example` placeholders only; keep real values in local `.env` or secret managers.
- Rotate credentials immediately if exposure is suspected.
- Redact logs, screenshots, and traces before sharing externally.
