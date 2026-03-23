# /test

Run the test suite and analyze results.

## Steps
1. Run the full test suite: `{{testCommand}}`
2. If tests fail, analyze the failure output
3. For each failing test:
   - Identify the root cause
   - Check if it's a test issue or code issue
   - Suggest a fix with code diff
4. Report coverage delta if coverage config exists

## Constraints
- Never modify test expectations to make tests pass
- If a test is genuinely wrong, explain why before fixing
- Always run the full suite, not just changed files
