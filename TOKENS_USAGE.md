# Token Usage Guide

This file gives planning estimates for LLM calls made by the browser-agent prompts. It is not a billing source of truth; provider pricing, model routing, retries, screenshots, and prompt changes can move the final cost.

No credentials, cookies, profile data, prompts with private user content, or production request logs should be added here.

## Reading the Estimates

- Input tokens include instructions, browser observations, page context, and optional vision/image context.
- Output tokens include the model's structured action response and reasoning fields.
- "Good" assumes a straightforward page state with few retries.
- "Worst" assumes extra observations, retries, or a more complex page state.
- Use provider dashboards for exact billing.

## Facebook

| Workflow | Good input | Good output | Worst input | Worst output | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Personal post, text only | 11,850 | 1,650 | 19,750 | 2,750 | Typical composer discovery and submit flow |
| Personal post, with image | 17,775 | 2,475 | 27,650 | 3,850 | Includes image upload context and extra verification |
| Comment/reply | 9,875 | 1,375 | 13,825 | 1,925 | Usually shorter than feed posting |
| Profile/page post parsing | 9,000 | 1,200 | 18,000 | 2,400 | Depends heavily on visible post count and page layout |

## X

| Workflow | Good input | Good output | Worst input | Worst output | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Personal post, text only | 9,875 | 1,375 | 17,775 | 2,475 | Typical compose-and-submit flow |
| Personal post, with image | 13,825 | 1,925 | 23,700 | 3,300 | Includes media upload context |
| Reply | 9,875 | 1,375 | 13,825 | 1,925 | Usually shorter than feed posting |

## Model Notes

- Claude Sonnet-class models have worked best for complex visual/browser reasoning.
- Smaller or local vision models may need more retries, which increases token usage even if per-token cost is lower.
- Keep `MAX_AI_RETRIES` conservative for community deployments to control spend.
