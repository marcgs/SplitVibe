import { describe, it, expect } from "vitest";
import { Prisma, $Enums } from "@prisma/client";

describe("Prisma schema", () => {
  const modelNames = Prisma.dmmf.datamodel.models.map((m) => m.name);

  it("defines all required application models", () => {
    const requiredModels = [
      "User",
      "Group",
      "GroupMember",
      "Expense",
      "ExpenseSplit",
      "Settlement",
      "Attachment",
      "ExchangeRate",
    ];
    for (const model of requiredModels) {
      expect(modelNames).toContain(model);
    }
  });

  it("defines Auth.js adapter models", () => {
    const authModels = ["Account", "Session", "VerificationToken"];
    for (const model of authModels) {
      expect(modelNames).toContain(model);
    }
  });

  it("defines ExpensePayer model for multi-payer support", () => {
    expect(modelNames).toContain("ExpensePayer");
  });

  it("defines the SplitMode enum with correct values", () => {
    expect($Enums.SplitMode).toEqual({
      EQUAL: "EQUAL",
      PERCENTAGE: "PERCENTAGE",
      SHARES: "SHARES",
    });
  });

  describe("Expense model", () => {
    const expenseFields = Prisma.ExpenseScalarFieldEnum;

    it("has soft-delete support via deletedAt", () => {
      expect(expenseFields).toHaveProperty("deletedAt");
    });

    it("has FX rate snapshot fields", () => {
      expect(expenseFields).toHaveProperty("fxRate");
      expect(expenseFields).toHaveProperty("baseCurrencyAmount");
    });
  });

  describe("Group model", () => {
    const groupFields = Prisma.GroupScalarFieldEnum;

    it("has inviteToken field", () => {
      expect(groupFields).toHaveProperty("inviteToken");
    });
  });

  describe("Settlement model", () => {
    const settlementFields = Prisma.SettlementScalarFieldEnum;

    it("has soft-delete support via deletedAt", () => {
      expect(settlementFields).toHaveProperty("deletedAt");
    });
  });

  describe("ExchangeRate model", () => {
    const exchangeRateFields = Prisma.ExchangeRateScalarFieldEnum;

    it("has rate field for FX data", () => {
      expect(exchangeRateFields).toHaveProperty("rate");
      expect(exchangeRateFields).toHaveProperty("fromCcy");
      expect(exchangeRateFields).toHaveProperty("toCcy");
    });
  });
});
