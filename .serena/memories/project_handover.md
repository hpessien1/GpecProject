# GPEC project handover

Superseded by the repository's own documents. Read these instead of relying on this note:

- `CLAUDE.md` — engineering rules, architecture, commands, known gaps.
- `ROADMAP.md` — plan to launch and progress (steps 1 and 2 done as of 2026-10-21).
- `HANDOVER.md` — current state and the next session's starting points.
- `ECOMMERCE_REQUIREMENTS.md` — shop, checkout, and Paystack payment behaviour.
- `AGENTS.md` / `README.md` — content rules and the company brief.

Key facts in brief (2026-10-21):
- Project lives at `/home/worlanyo/Desktop/GpecProject` (Linux). Earlier macOS paths no longer apply.
- Frontend: React + Vite, TypeScript. Backend: Express 5 + Mongoose, TypeScript, Vitest tests.
- Database: MongoDB Atlas, `gpec_dev` locally, `gpec` in production.
- Payments: Paystack hosted checkout is in scope (not yet built); no card data on GPEC systems.
- Follow `AGENTS.md`: no invented company facts, prices, stock, certifications, or claims.
