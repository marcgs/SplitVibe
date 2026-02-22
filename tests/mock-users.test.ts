import { describe, it, expect } from "vitest";
import { mockUsers } from "@/lib/mock-users";

describe("mock-users", () => {
  it("exports three test personas", () => {
    expect(mockUsers).toHaveLength(3);
  });

  it("each user has required fields", () => {
    for (const user of mockUsers) {
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("image");
      expect(user.email).toContain("@");
    }
  });

  it("includes Alice, Bob, and Carol", () => {
    const names = mockUsers.map((u) => u.name);
    expect(names).toContain("Alice");
    expect(names).toContain("Bob");
    expect(names).toContain("Carol");
  });

  it("all emails are unique", () => {
    const emails = mockUsers.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("all ids are unique", () => {
    const ids = mockUsers.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
