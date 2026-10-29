import test from "node:test";
import assert from "node:assert/strict";
import { mathQrcodeKey } from "../src/features/math/library/math-qrcode.ts";
test("book QR codes accept encoded scan URLs and preserve raw identifiers", () => {
  assert.equal(mathQrcodeKey("  abc123  "), "abc123");
  assert.equal(mathQrcodeKey("https://books.example/scan?id=abc123"), "abc123");
  assert.equal(
    mathQrcodeKey(
      encodeURIComponent("https://books.example/scan?qrcode=abc123"),
    ),
    "abc123",
  );
});
