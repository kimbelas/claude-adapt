## Commit Conventions

- Follow the Conventional Commits specification: `<type>(<scope>): <description>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`
- Keep the subject line under 72 characters.
- Use the imperative mood in the subject: "add feature" not "added feature".
- Reference issue numbers in the body when applicable: `Closes #123`.
- Separate subject from body with a blank line.
- Use the body to explain *what* and *why*, not *how*.

### Branch Naming

- Feature branches: `feat/<short-description>` or `feature/<ticket-id>-<description>`
- Bug fixes: `fix/<short-description>` or `bugfix/<ticket-id>-<description>`
- Hotfixes: `hotfix/<description>`
- Keep branch names lowercase with hyphens as separators.

### Pull Requests

- Title follows the same convention as commit subjects.
- Include a summary of changes and the motivation.
- Link related issues.
- Request reviews from relevant code owners.
- Squash commits when merging feature branches to keep history clean.
