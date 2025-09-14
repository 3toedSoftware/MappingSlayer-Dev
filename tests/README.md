# Mapping Slayer Tests

## Philosophy

We write tests **when we need them**, not just to have them.

## When to Write Tests

✅ **Write a test when:**

- You've broken the same thing multiple times
- Before major refactoring
- For critical business logic (save/load, PDF handling)
- To reproduce and fix bugs
- For complex calculations that are hard to verify manually

❌ **Don't test:**

- Simple getters/setters
- UI styling
- Prototype code
- Trivial functions

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Interactive UI
npm run test:ui
```

## Writing Your First Test

1. Copy `example.test.js` as a starting point
2. Import the function/module you want to test
3. Write focused tests for specific behavior
4. Delete the example code

## Example Test Patterns

### Testing a calculation

```javascript
import { calculateDotPosition } from '../src/app/map-controller.js';

describe('Dot Position Calculation', () => {
    it('should scale position correctly', () => {
        const result = calculateDotPosition(100, 200, 2.0);
        expect(result).toEqual({ x: 200, y: 400 });
    });
});
```

### Testing async operations

```javascript
describe('Save Functionality', () => {
    it('should compress data when saving', async () => {
        const data = { large: 'dataset' };
        const compressed = await compressForSave(data);
        expect(compressed.size).toBeLessThan(JSON.stringify(data).length);
    });
});
```

### Testing error handling

```javascript
describe('PDF Loading', () => {
    it('should handle invalid PDF gracefully', async () => {
        const result = await loadPDF('invalid.pdf');
        expect(result.error).toBeTruthy();
        expect(result.error.message).toContain('Invalid PDF');
    });
});
```

## Test Organization

```
tests/
├── example.test.js          # Template - copy this
├── critical/               # Critical path tests (when needed)
│   ├── save-load.test.js
│   └── pdf-handling.test.js
├── bugs/                   # Regression tests for bugs
│   └── issue-123.test.js
└── features/               # Feature-specific tests
    └── marker-calc.test.js
```

## Remember

- **Test when it hurts** - If manual testing is painful, automate it
- **Test what breaks** - If it broke once, it might break again
- **Test what's critical** - Business logic that must work
- **Keep tests simple** - Test one thing at a time
- **Delete dead tests** - If code is gone, delete its tests
