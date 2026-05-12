# Contributing

Thanks for contributing to Avatar Browser Service.

## Local Setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
npm install
npx playwright install chromium
```

3. Configure environment:

```bash
cp .env.example .env
```

4. Set required values in `.env`:

- `API_SECRET`
- `LLM_PROVIDER`
- `LLM_API_KEY` (unless using `LLM_PROVIDER=ollama`)

5. Start the service:

```bash
npm start
```

6. Run tests before opening a PR:

```bash
npm test
```

## Development Rules

- Keep changes focused and minimal.
- Do not commit real credentials, cookies, or private tokens.
- Do not include exported session cookies in issues or pull requests.
- Keep docs and examples aligned with actual API behavior.
- Preserve compatibility with existing profile IDs (`x-{avatar}`, `facebook-{avatar}`).

## Pull Request Guidance

Before submitting a PR:

1. Run tests and include results in your PR description.
2. Update docs (`README.md`, `API_REFERENCES.md`, templates) for user-facing changes.
3. Add or update tests for behavior changes.
4. Keep commit history and PR scope reviewable.

PRs should include:

- Problem statement
- What changed
- How to test
- Any known limitations or follow-up work
