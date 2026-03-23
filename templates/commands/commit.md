# /commit

Stage changes and create a well-structured commit.

## Steps
1. Run `git status` and `git diff --staged` to inspect current changes
2. If nothing is staged, identify logical change groups and stage them:
   - Group related files into a single coherent commit
   - Avoid mixing unrelated changes in one commit
3. Generate a commit message following the Conventional Commits format:
   - **Type**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`, `style`
   - **Scope** (optional): the module or area affected (e.g., `auth`, `api`, `ui`)
   - **Subject**: imperative mood, lowercase, no period, max 72 characters
   - **Body** (if needed): explain *why* the change was made, not *what* changed
   - **Breaking changes**: prefix the body with `BREAKING CHANGE:` if applicable
4. Create the commit: `git commit -m "<message>"`
5. Show the resulting `git log --oneline -1` to confirm

## Examples
```
feat(auth): add OAuth2 login flow with Google provider
fix(api): prevent duplicate entries on concurrent POST requests
refactor(db): extract query builder into shared utility
test(cart): add edge case coverage for empty cart checkout
```

## Constraints
- Never create empty commits
- Never use `--no-verify` to skip pre-commit hooks
- Never amend a previous commit unless explicitly asked
- Keep the subject line under 72 characters
- If changes span multiple unrelated areas, split into separate commits
