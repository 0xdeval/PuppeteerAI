# Security

## Reporting Vulnerabilities

Please report security issues privately to the project maintainer instead of opening a public issue. Include reproduction steps, affected configuration, and any relevant logs with secrets removed.

## Secret Handling

- Never commit `.env`, cookies, profile data, Dolphin tokens, API keys, or debug screenshots.
- Treat exported social platform cookies as account credentials.
- Use a strong `API_SECRET` for every non-local deployment.
- Keep `DATA_DIR` on trusted storage because it contains browser sessions.
