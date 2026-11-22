import {
  decodeWebSocketPacket
} from "./websocket-decoder.js";

import assert from "node:assert/strict";

function makePacket(mode) {
  const lengths = {
    1: 51,
    2: 123,
    3: 379
  };

  const buffer = new ArrayBuffer(lengths[mode]);
  const view = new DataView(buffer);

  view.setUint8(0, mode);
  view.setUint8(1, 1);

  const token = new TextEncoder().encode("99926000");
  new Uint8Array(buffer, 2, 25).set(token);

  view.setBigInt64(27, 123n, true);
  view.setBigInt64(35, 1790000000000n, true);
  view.setBigInt64(43, 2500000n, true);

  if (mode >= 2) {
    view.setBigInt64(51, 10n, true);
    view.setBigInt64(59, 2490000n, true);
    view.setBigInt64(67, 100000n, true);

    view.setFloat64(75, 1000, true);
    view.setFloat64(83, 900, true);

    view.setBigInt64(91, 2400000n, true);
    view.setBigInt64(99, 2600000n, true);
    view.setBigInt64(107, 2300000n, true);
    view.setBigInt64(115, 2450000n, true);
  }

  if (mode === 3) {
    view.setBigInt64(123, 1790000000000n, true);
    view.setBigInt64(131, 5000n, true);

    for (let i = 0; i < 10; i++) {
      const offset = 147 + i * 20;

      view.setInt16(offset, i < 5 ? 1 : 0, true);
      view.setBigInt64(offset + 2, 100n, true);
      view.setBigInt64(offset + 10, 2500000n, true);
      view.setInt16(offset + 18, 2, true);
    }

    view.setBigInt64(347, 3000000n, true);
    view.setBigInt64(355, 2000000n, true);
    view.setBigInt64(363, 3500000n, true);
    view.setBigInt64(371, 1500000n, true);
  }

  return buffer;
}

// Test all three packet modes
for (const mode of [1, 2, 3]) {
  const result = decodeWebSocketPacket(makePacket(mode));

  assert.equal(result.mode, mode);
  assert.equal(result.token, "99926000");
  assert.equal(result.ltp, 25000);

  console.log(`Mode ${mode}: PASS`);
}

// Test invalid short packet
assert.throws(
  () => decodeWebSocketPacket(new ArrayBuffer(10)),
  /too short|packet length|unknown subscription mode/i
);

// Test incorrect packet length
assert.throws(
  () => decodeWebSocketPacket(makePacket(1).slice(0, 20)),
  /packet length/i
);

console.log("All decoder tests passed.");