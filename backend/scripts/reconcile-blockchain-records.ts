/** Legacy reconciliation is retired; this command must not enqueue obsolete writes. */
console.error('Legacy blockchain reconciliation is retired. Use the durable AnchorBatch worker and its reconciliation tooling.');
process.exitCode = 1;
