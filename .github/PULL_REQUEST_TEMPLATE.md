## Summary of Changes

<!-- Describe what this PR does and why. Link to the relevant issue or ticket. -->

## Type of Change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `chore` — tooling, dependencies, or configuration
- [ ] `docs` — documentation only
- [ ] `refactor` — code change that neither fixes a bug nor adds a feature
- [ ] `test` — adding or updating tests
- [ ] `ci` — CI/CD pipeline changes
- [ ] `perf` — performance improvement

## Testing Done

<!-- Describe the tests you ran and how to reproduce them. -->

## Checklist

- [ ] `pnpm type-check` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm test` passes with ≥ 80% coverage
- [ ] No `console.log` statements left in code
- [ ] No inline styles in web components
- [ ] No `any` types introduced
- [ ] No hardcoded secrets or credentials
- [ ] All state-changing operations write an `AuditLog` entry
- [ ] GPS coordinates are not stored anywhere
- [ ] New environment variables added to `.env.example`
