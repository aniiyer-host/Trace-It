import crypto from "node:crypto";

export function verifyHexSignature(expected: string, provided: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(expected) || !/^[a-f\d]{64}$/i.test(provided)) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(provided, "hex"),
  );
}
