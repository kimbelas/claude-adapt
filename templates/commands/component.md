# /component

Scaffold a new React component with all supporting files.

## Arguments
- `name` (required): PascalCase component name (e.g., `UserProfile`)
- `path` (optional): directory under `{{componentRoot}}` (default: top-level)
- `type` (optional): `page` | `layout` | `ui` | `feature` (default: `ui`)

## Steps
1. Validate the component name is PascalCase
2. Check that a component with the same name does not already exist at the target path
3. Create the component directory at `{{componentRoot}}/{{path}}/{{name}}/`
4. Generate the following files:

### `{{name}}.tsx`
```tsx
{{#if useClientDirective}}
'use client';

{{/if}}
import type { {{name}}Props } from './{{name}}.types';
{{#if styleModule}}
import styles from './{{name}}.module.{{styleExtension}}';
{{/if}}

export function {{name}}({ {{defaultProps}} }: {{name}}Props) {
  return (
    <div{{#if styleModule}} className={styles.root}{{/if}}{{#if testId}} data-testid="{{kebabName}}"{{/if}}>
      {/* TODO: implement {{name}} */}
    </div>
  );
}
```

### `{{name}}.types.ts`
```typescript
export interface {{name}}Props {
  /** Optional CSS class name for the root element */
  className?: string;
  /** Content to render inside the component */
  children?: React.ReactNode;
}
```

### `{{name}}.test.tsx`
```tsx
import { render, screen } from '{{testingLibraryImport}}';
import { {{name}} } from './{{name}}';

describe('{{name}}', () => {
  it('renders without crashing', () => {
    render(<{{name}} />);
    {{#if testId}}
    expect(screen.getByTestId('{{kebabName}}')).toBeInTheDocument();
    {{else}}
    expect(document.querySelector('div')).toBeInTheDocument();
    {{/if}}
  });
});
```

### `index.ts`
```typescript
export { {{name}} } from './{{name}}';
export type { {{name}}Props } from './{{name}}.types';
```

{{#if styleModule}}
### `{{name}}.module.{{styleExtension}}`
```css
.root {
  /* TODO: add styles */
}
```
{{/if}}

{{#if storybook}}
### `{{name}}.stories.tsx`
```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { {{name}} } from './{{name}}';

const meta: Meta<typeof {{name}}> = {
  title: '{{storybookCategory}}/{{name}}',
  component: {{name}},
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof {{name}}>;

export const Default: Story = {
  args: {},
};
```
{{/if}}

5. Update the nearest barrel export (`index.ts`) if one exists in the parent directory

## Constraints
- Always generate a test file; never skip tests
- Use named exports, not default exports
- Follow the existing project naming and directory conventions
- Do not overwrite existing components; abort and notify if a conflict is found
- Ensure all generated files pass the project linter before finishing
