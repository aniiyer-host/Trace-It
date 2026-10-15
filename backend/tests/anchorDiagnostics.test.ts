import { formatAnchorOperatorError } from "../src/services/anchor/anchorDiagnostics.js";

describe("anchor operator diagnostics", () => {
  it("preserves the original exception stack while redacting credentials and addresses", () => {
    const error = new Error(
      "database refused request to https://rpc.example/?api-key=secret-token for user@example.com",
    );
    const output = formatAnchorOperatorError(error, {
      TRACEIT_ANCHOR_RPC_URL: "https://rpc.example/?api-key=secret-token",
      GMAIL_APP_PASSWORD: "secret-token",
    });

    expect(output).toContain("Selected anchor batch failed; no success is reported.");
    expect(output).toContain("Error: database refused request");
    expect(output).toContain("at Object.<anonymous>");
    expect(output).toContain("[email redacted]");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("rpc.example");
  });
});
