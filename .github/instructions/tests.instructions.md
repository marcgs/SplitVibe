---
applyTo: "tests/**/*.ts"
---

# Test Conventions (Vitest)

- Structure: `describe("VERB /api/path" or "module name", () => { it("should ...", async () => { ... }) })`.
- Place `vi.mock()` calls before any imports of the mocked modules.
- Create mock objects (`mockSession`, `mockDb`) as plain objects with `vi.fn()` methods.
- Reset mocks in `beforeEach` using `vi.clearAllMocks()` and re-setup default return values.
- For API route tests, use a `jsonRequest(body)` helper that builds a `new Request(...)` with JSON headers.
- Dynamically import the route handler inside each test: `const { POST } = await import("@/app/api/...")`.
- Use `vi.resetModules()` + `vi.doMock()` when environment or module state must change between tests.
- Use `vi.stubEnv("VAR", "value")` for environment overrides; call `vi.unstubAllEnvs()` in cleanup.
- Floating-point assertions: `.toBeCloseTo(expected, 2)` for decimal comparisons.
- Check mock calls: `expect(mockDb.model.method).toHaveBeenCalledWith(expect.objectContaining({...}))`.
