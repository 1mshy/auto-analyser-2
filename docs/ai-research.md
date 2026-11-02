# AI research workspace

The **AI research** page answers questions about one stock or compares up to four symbols using the application's latest stored analyses. Open it from the Research navigation group or **Ask AI** on a stock page.

Choose symbols, write a question or select a suggested question, then submit. Suggestions only fill the form. Opening a link or editing inputs does not run the model. The answer keeps the submitted question and source snapshot together, even if the form changes afterward.

## What the model receives

The backend loads stored stock analyses for the requested symbols and sends a bounded snapshot plus the question to the configured model. The response includes the source figures and analysis timestamps so users can inspect what the answer was based on. Missing symbols and unavailable indicators are explicit.

This is a research aid based on supplied observations. It does not browse the web, execute trades, create alert rules, or change watchlists. Questions and generated answers are not persisted as a conversation history. Model output can be incorrect; compare claims with the supplied source figures.

## Local model connection

Configure the existing OpenAI-compatible client in the backend environment:

```dotenv
AI_BASE_URL=http://10.150.0.30:1234/v1
OPENROUTER_ENABLED=true
# Set AI_API_KEY only when this server requires authentication.
```

Models are discovered through `/v1/models`; no model name is hardcoded. The browser calls the application backend, which calls the model server. Keep the LAN address on the backend rather than in `VITE_` variables. `GET /api/ai/status` reports the configured model and availability.

The research request has bounded input/output, a time limit, and a single-generation concurrency limit. Repeated clicks do not queue unlimited work. Cancel stops the browser request; a model server may continue work already accepted until its own cancellation or timeout handling completes.

The generation path rejects empty, reasoning-only, and token-truncated responses rather than displaying them as finished research. No news articles or live web context are included in this feature's source snapshot. The instructions distinguish present indicator positions from historical trends: a single snapshot cannot establish a crossover, persistent trend, or validated support/resistance.

## Verification

Verified on 2026-09-18 with `unsloth/Qwen3.8-27B-NVFP4`, discovered from the supplied LAN endpoint. A live AAPL/MSFT comparison returned the same stored figures and timestamps shown in its source cards. Stock-page links prefill the research form without generating an answer. The completed answer and evidence cards fit 320, 375, 414 and 768 pixels without horizontal overflow. Live invalid-question and unknown-symbol requests returned HTTP 400 and 404 respectively.

All 67 frontend tests and the production build pass. The full Rust test suite passes in Docker; native compilation is unavailable until the host's Xcode license is accepted. Research-specific checks cover validation, source serialization, prompt boundaries, shared concurrency limits, upstream errors, and incomplete or hidden-reasoning responses.

The local backend was rebuilt for this verification. The current frontend preview is `http://127.0.0.1:3016/research`; the separate Docker frontend requires its normal rebuild to pick up the new interface and proxy timeout.

## Ownership

- `src/ai_research.rs`: request validation, source snapshot, prompt construction, and research endpoint.
- `src/openrouter.rs`: model discovery and OpenAI-compatible generation.
- `frontend/src/features/research/`: research form, answer, source evidence, and interaction state.
- `frontend/src/pages/ResearchPage.tsx`: route composition.
- `frontend/src/api.ts` and `queries.ts`: transport and request hooks.

Existing stock analysis and news summaries continue using the same configured AI connection.
