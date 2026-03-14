import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("infra validation", () => {
  it("should allow Container Apps to resolve Key Vault secrets", () => {
    const keyVaultModule = readFileSync(
      join(process.cwd(), "infra/modules/keyVault.bicep"),
      "utf8",
    );

    expect(keyVaultModule).toContain("publicNetworkAccess: 'Enabled'");
    expect(keyVaultModule).toContain("networkAcls:");
    expect(keyVaultModule).toContain("bypass: 'AzureServices'");
  });

  it("should make Google OAuth secret wiring optional for bootstrap deployments", () => {
    const keyVaultModule = readFileSync(
      join(process.cwd(), "infra/modules/keyVault.bicep"),
      "utf8",
    );
    const containerAppsModule = readFileSync(
      join(process.cwd(), "infra/modules/containerApps.bicep"),
      "utf8",
    );

    expect(keyVaultModule).toContain("resource secretAuthGoogleId");
    expect(keyVaultModule).toContain("if (!empty(authGoogleId))");
    expect(keyVaultModule).toContain("if (!empty(authGoogleSecret))");
    expect(keyVaultModule).toContain("output authGoogleIdSecretUri string = !empty(authGoogleId)");
    expect(keyVaultModule).toContain(
      "output authGoogleSecretSecretUri string = !empty(authGoogleId)",
    );

    expect(containerAppsModule).toContain("var hasGoogleAuthSecrets");
    expect(containerAppsModule).toContain("var containerSecrets = concat([");
    expect(containerAppsModule).toContain("], !hasGoogleAuthSecrets ? [] : [");
    expect(containerAppsModule).toContain("secretRef: 'auth-google-id'");
    expect(containerAppsModule).toContain("secretRef: 'auth-google-secret'");
  });
});
