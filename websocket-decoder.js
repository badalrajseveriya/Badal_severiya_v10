
const PACKET_LENGTHS = {
  1: 51,   // LTP
  2: 123,  // Quote
  3: 379   // Snap Quote
};

function decodeWebSocketPacket(
  input,
  options = {}
) {
  const priceScale = options.priceScale ?? 100;

  if (!Number.isFinite(priceScale) || priceScale <= 0) {
    throw new Error("Invalid price scale");
  }

  let buffer;

  if (input instanceof ArrayBuffer) {
    buffer = input;
  } else if (ArrayBuffer.isView(input)) {
    buffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    );
  } else {
    throw new Error("Input must be an ArrayBuffer or TypedArray");
  }

  const view = new DataView(buffer);

  if (view.byteLength < 2) {
    throw new Error("Packet is too short");
  }

  const mode = view.getUint8(0);
  const exchangeType = view.getUint8(1);

  const expectedLength = PACKET_LENGTHS[mode];

  if (!expectedLength) {
    throw new Error("Unknown subscription mode");
  }

  if (view.byteLength !== expectedLength) {
    throw new Error(
      `Invalid packet length: expected ${expectedLength}, received ${view.byteLength}`
    );
  }

  const decoder = new TextDecoder();

  const tokenBytes = new Uint8Array(buffer, 2, 25);

  let tokenEnd = tokenBytes.indexOf(0);

  if (tokenEnd === -1) {
    tokenEnd = 25;
  }

  const token = decoder.decode(
    tokenBytes.subarray(0, tokenEnd)
  );

  const readInt64 = (offset) =>
    view.getBigInt64(offset, true).toString();

  const readNumber64 = (offset) => {
    const value = Number(readInt64(offset));

    if (!Number.isSafeInteger(value)) {
      throw new Error("Integer exceeds safe numeric range");
    }

    return value;
  };

  const readPrice = (offset) =>
    readNumber64(offset) / priceScale;

  const result = {
    mode,
    modeName: {
      1: "LTP",
      2: "QUOTE",
      3: "SNAP_QUOTE"
    }[mode],
    exchangeType,
    token,
    sequenceNumber: null,
    exchangeTimestamp: null,
    ltp: null
  };

  // Sequence number: index feed may not provide it.
  if (exchangeType !== 1 && exchangeType !== 3) {
    result.sequenceNumber = readInt64(27);
  }

  result.exchangeTimestamp = readInt64(35);

  result.ltp = readPrice(43);

  // LTP packet ends at byte 51.
  if (mode === 1) {
    return result;
  }

  result.lastTradedQuantity = readInt64(51);
  result.averageTradedPrice = readPrice(59);
  result.volumeTraded = readInt64(67);

  result.totalBuyQuantity = view.getFloat64(75, true);
  result.totalSellQuantity = view.getFloat64(83, true);

  result.open = readPrice(91);
  result.high = readPrice(99);
  result.low = readPrice(107);
  result.close = readPrice(115);

  // Quote packet ends at byte 123.
  if (mode === 2) {
    return result;
  }

  result.lastTradedTimestamp = readInt64(123);
  result.openInterest = readInt64(131);

  // Documentation identifies this field as dummy.
  result.openInterestChangePercent = null;

  result.bestFive = [];

  for (let i = 0; i < 10; i++) {
    const offset = 147 + (i * 20);

    const flag = view.getInt16(offset, true);
    const quantity = readInt64(offset + 2);
    const price = readPrice(offset + 10);
    const orders = view.getInt16(offset + 18, true);

    result.bestFive.push({
      side: flag === 1 ? "BUY" : "SELL",
      quantity,
      price,
      orders
    });
  }

  result.upperCircuit = readPrice(347);
  result.lowerCircuit = readPrice(355);
  result.week52High = readPrice(363);
  result.week52Low = readPrice(371);

  return result;
}

export {
  decodeWebSocketPacket,
  PACKET_LENGTHS
};
