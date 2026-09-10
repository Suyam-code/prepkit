# Interview Prep Kit

Turns a job description + company URL into an editable, regeneratable interview prep kit.

> This README is a stub — fill in each section as we build the corresponding phase.
> See `01_plan_and_architecture.md` (shared separately) for the full design reasoning.

## Tech stack
Next.js + Tailwind, Express, MongoDB, TypeScript throughout. (Justification: TODO)

## LLM provider
TODO — provider + model used.

## Setup

```bash
npm install
cp backend/.env.example backend/.env      # fill in secrets
cp frontend/.env.example frontend/.env.local

npm run dev:backend     # http://localhost:4000
npm run dev:frontend    # http://localhost:3000
```

## Batch entry point

```bash
npm run evaluate -- --input cases.json --output kits.json
```
(workspace: backend — see `backend/scripts/evaluate.ts`)

## Architecture
TODO

## Retrieval approach & sources
TODO

## Research/generation sequencing
TODO

## Generated / edited / pinned state model
TODO

## Schedule allocation
TODO

## Creative feature
TODO (optional)

## Key decisions & trade-offs / known limitations
TODO
