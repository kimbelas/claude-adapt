# /lint

Run the linter across the project and fix issues.

## Steps
1. Run the linter: `{{lintCommand}}`
2. Parse the output and categorize issues by severity (error vs warning)
3. For each error:
   - Apply the autofix if one is available: `{{lintFixCommand}}`
   - If no autofix exists, manually resolve the issue following the project's code conventions
4. For each warning:
   - Fix if the change is straightforward and safe
   - Flag for review if the fix could alter behavior
5. Re-run the linter to confirm zero remaining errors
6. Report a summary of changes made

## Constraints
- Never disable lint rules with inline comments (e.g., `// eslint-disable`) unless there is a documented, justified reason
- Do not suppress warnings globally; fix them at the source
- Preserve existing code formatting conventions — do not reformat unrelated lines
- If a rule conflict exists between the linter and the formatter, defer to the formatter configuration
