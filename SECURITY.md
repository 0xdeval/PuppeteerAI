# Security

## Reporting Vulnerabilities

Please report security issues privately through GitHub's **Security** tab using **Report a vulnerability**. If private vulnerability reporting is not enabled for the published repository yet, contact the maintainer privately through the maintainer profile listed on GitHub instead of opening a public issue.

Include reproduction steps, affected configuration, and any relevant logs with secrets removed. The expected initial response time is 5 business days.

## Secret Handling

- Never commit `.env`, cookies, profile data, Dolphin tokens, API keys, or debug screenshots.
- Treat exported social platform cookies as account credentials.
- Use a strong `API_SECRET` for every non-local deployment.
- Keep `DATA_DIR` on trusted storage because it contains browser sessions.
