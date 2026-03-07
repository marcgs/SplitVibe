import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Dockerfile", () => {
  it("should default plain docker builds to a production stage", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const stageNames = Array.from(
      dockerfile.matchAll(/^FROM\s+[^\n]+?\s+AS\s+([A-Za-z0-9_-]+)$/gm),
      (match) => match[1],
    );

    expect(stageNames.at(-1)).toBe("runner");
    expect(stageNames.at(-1)).not.toBe("dev");
    expect(dockerfile).toContain('CMD ["sh", "start.sh"]');
  });
});
