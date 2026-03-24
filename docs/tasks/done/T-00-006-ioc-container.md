# T-00-006 Setup IoC container

## Goal
Implement a lightweight IoC (Inversion of Control) dependency injection container in `packages/shared/di/` that supports service registration, resolution, and lifecycle management.

## Why
All services must be registered in the IoC container — no manual instantiation (ARCHITECTURE.md guardrail). Workers resolve dependencies from the container at startup. This foundation is required before any service implementation.

## Inputs
- `docs/ARCHITECTURE.md` § "IoC (Inversion of Control)"
- `docs/TECH_STACK.md` § "IoC Container"
- T-00-001 outputs: `packages/shared/di/` directory

## Dependencies
- T-00-001 (monorepo structure with packages/shared/)

## Expected Outputs
- `packages/shared/di/container.ts` — Container class with register/resolve/dispose methods
- `packages/shared/di/tokens.ts` — Service token definitions (injection keys)
- `packages/shared/di/types.ts` — ServiceFactory, ServiceScope types
- `packages/shared/di/decorators.ts` — @Injectable decorator
- `packages/shared/di/index.ts` — barrel export
- Unit tests for container lifecycle

## Deliverables
- Working IoC container with registration and resolution
- Support for singleton and transient scopes
- Typed service tokens for compile-time safety
- Unit tests proving container behavior

## Constraints
- Lightweight implementation — no heavy DI frameworks (no inversify, no tsyringe)
- Type-safe: token-based resolution with generic types
- Singleton scope: one instance per container lifetime
- Transient scope: new instance per resolution
- Container must support async factory functions (for DB connections, etc.)
- Container.dispose() must clean up all singletons in reverse registration order

## Steps
1. Define types: ServiceToken<T>, ServiceFactory<T>, ServiceScope enum
2. Implement Container class with register<T>(token, factory, scope) and resolve<T>(token) methods
3. Implement singleton caching (resolve once, return same instance)
4. Implement transient scope (new instance per resolve)
5. Implement dispose() for cleanup
6. Add @Injectable decorator for class-based registration
7. Define initial service tokens in tokens.ts
8. Write unit tests:
   - Register and resolve a service
   - Singleton returns same instance
   - Transient returns new instance
   - Async factory resolves correctly
   - Dispose cleans up singletons
   - Resolving unregistered token throws
9. Create barrel export

## Acceptance Criteria
- Container.register() and Container.resolve() work with typed tokens
- Singleton scope returns same instance across multiple resolve calls
- Transient scope returns new instance each time
- Async factories are supported
- dispose() cleans up resources
- At least 6 test cases
- `bun test --filter di` passes

## Validation
```bash
bun test --filter "di"
```

## Out of Scope
- Actual service implementations (domain services come in later epics)
- Worker bootstrap wiring (EP01+)
- @Transactional integration (T-00-007)
- Auto-scanning / reflection-based registration

## Implementation Plan
- Files: di/types.ts, di/container.ts, di/tokens.ts, di/decorators.ts, di/index.ts, di/__tests__/container.test.ts
- Approach: TDD — lightweight custom container with typed tokens, singleton/transient scopes
- Test strategy: 8 test cases covering all acceptance criteria

## Implementation Notes
- Date: 2026-03-22
- Files changed: packages/shared/di/types.ts, container.ts, tokens.ts, decorators.ts, index.ts, __tests__/container.test.ts, packages/shared/index.ts
- Tests: 8 passing (register/resolve, singleton, transient, async factory, dispose, unregistered throws, has(), @Injectable)
- Approach: Symbol-based tokens for type-safe service identification. Container supports sync/async factories. Dispose cleans up singletons in reverse registration order.
- Validation: `bun test --filter di` → 8/8 pass, lint pass, typecheck pass

## Outputs
- `packages/shared/di/container.ts` — Container class (register, resolve, has, dispose)
- `packages/shared/di/types.ts` — ServiceToken<T>, ServiceFactory<T>, ServiceScope, createToken()
- `packages/shared/di/tokens.ts` — Initial service tokens (Logger, Database, EventBus)
- `packages/shared/di/decorators.ts` — @Injectable decorator
- `packages/shared/di/index.ts` — barrel export
