const { bootstrapSession, fetchInfo, formatDate } = require('../api/_lib/tefas');

async function main() {
  const cookie = await bootstrapSession();
  for (let daysBack = 0; daysBack < 7; daysBack += 1) {
    const asOf = new Date();
    asOf.setUTCDate(asOf.getUTCDate() - daysBack);
    const date = formatDate(asOf);
    const rows = await fetchInfo({
      start: date,
      end: date,
      kind: 'YAT',
      cookie,
    });

    const codes = Array.from(
      new Set(
        (rows || [])
          .map((row) => (row?.FONKODU || '').toString().trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (codes.length > 0) {
      process.stdout.write(JSON.stringify({ date, codes }));
      return;
    }
  }

  throw new Error('Could not determine the latest TEFAS YAT fund universe');
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
