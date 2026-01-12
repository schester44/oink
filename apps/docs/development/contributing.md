
## Getting Started

1. Fork the repository
2. Clone your fork
3. Set up local development (see [Local Setup](/development/local-setup))
4. Create a feature branch
5. Make your changes
6. Submit a pull request

## Code Style

### TypeScript

- Use strict mode
- Prefer `const` over `let`
- Use explicit types for function parameters
- Document public APIs with JSDoc

```typescript
/**
 * Process an incoming message.
 * @param message - The normalized message to process
 * @returns The processed result
 */
export async function processMessage(
  message: NormalizedMessage
): Promise<ProcessedResult> {
  // ...
}
```

### File Organization

- One component/module per file
- Group related files in directories
- Use `index.ts` for public exports

### Naming

- **Files**: kebab-case (`chat-handler.ts`)
- **Classes/Types**: PascalCase (`MessagePlugin`)
- **Functions/Variables**: camelCase (`handleIncoming`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)

## Commit Messages

Use conventional commits:

```
feat: add Discord plugin
fix: handle empty messages in Telegram
docs: update API reference
refactor: simplify session management
test: add plugin integration tests
```

## Pull Requests

### Before Submitting

- [ ] Code builds without errors
- [ ] TypeScript types are correct
- [ ] Tests pass (if applicable)
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow convention

### PR Description

Include:
- What changes were made
- Why the changes were needed
- How to test the changes
- Screenshots (for UI changes)

## Architecture Guidelines

### Adding a Plugin

1. Create directory in `apps/gateway/src/plugins/adapters/`
2. Implement `MessagePlugin` interface
3. Add configuration to `plugins.json` schema
4. Document in `apps/docs/plugins/`

### Adding an API Endpoint

1. Add to `packages/trpc/src/router.ts`
2. Add schema to `packages/trpc/src/schemas.ts`
3. Implement in gateway's tRPC server
4. Document in `apps/docs/api-reference/`

### Adding a Feature

1. Discuss in an issue first
2. Keep changes focused
3. Add documentation
4. Consider backwards compatibility

## Testing

### Manual Testing

1. Start gateway: `cd apps/gateway && yarn dev`
2. Use TUI client: `node apps/gateway/tui-client.mjs`
3. Test your changes

### Automated Tests

```bash
# Run all tests
yarn test

# Run specific package tests
cd apps/gateway && yarn test
```

## Documentation

### Where to Document

- **Code comments**: Complex logic, non-obvious behavior
- **README**: Package overview, quick start
- **apps/docs/**: User-facing documentation

### Documentation Style

- Use clear, simple language
- Include code examples
- Keep examples working and tested
- Use proper MDX formatting

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues/discussions first
