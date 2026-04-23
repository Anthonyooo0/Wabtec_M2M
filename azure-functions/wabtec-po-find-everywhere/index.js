const sql = require('mssql');

// Diagnostic endpoint — for a given list of Wabtec PO numbers, search EVERY
// M2M table that has a customer-PO-ish column and return which tables each
// PO appears in. Lets us figure out where the "missing in M2M" POs are
// actually hiding (EDI staging? Inquiry? History archive? Not booked yet?).
//
// NOT meant for production use — this is a one-off investigation tool. Once
// we know which table(s) matter, the real wabtec-po-compare SQL gets patched
// to include them and this endpoint can be removed.

const dbPools = {};

function getDbPool(connString) {
  if (!connString) return null;
  if (dbPools[connString]) return dbPools[connString];

  const parts = {};
  for (const segment of connString.split(';')) {
    const idx = segment.indexOf('=');
    if (idx === -1) continue;
    parts[segment.substring(0, idx).trim().toLowerCase()] = segment.substring(idx + 1).trim();
  }

  const pool = new sql.ConnectionPool({
    server: parts['server'] || parts['data source'] || '',
    database: parts['database'] || parts['initial catalog'] || '',
    user: parts['user id'] || parts['uid'] || '',
    password: parts['password'] || parts['pwd'] || '',
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 10, min: 1, idleTimeoutMillis: 60000 },
  });

  dbPools[connString] = pool.connect().then(() => pool).catch((err) => {
    delete dbPools[connString];
    throw err;
  });

  return dbPools[connString];
}

// Every M2M table that stores a customer PO, per schema scan. The column
// name varies (FCUSTPONO / FCCUSTPO / FCCUSTPONO / FGEPONO), so we list
// them explicitly. `idCol` is whatever makes sense as a row identifier
// for that table — used only for display, not for matching.
const TABLES = [
  { table: 'SOMAST',    poCol: 'FCUSTPONO',  label: 'Sales Order Master' },
  { table: 'X850MAST',  poCol: 'FCUSTPONO',  label: 'EDI 850 (incoming PO)' },
  { table: 'X830MAST',  poCol: 'FCUSTPONO',  label: 'EDI 830 (forecast)' },
  { table: 'X860MAST',  poCol: 'FCUSTPONO',  label: 'EDI 860 (PO change)' },
  { table: 'X862MAST',  poCol: 'FCUSTPONO',  label: 'EDI 862 (ship sched)' },
  { table: 'X830MHST',  poCol: 'FCUSTPONO',  label: 'EDI 830 history' },
  { table: 'X830RHST',  poCol: 'FCUSTPONO',  label: 'EDI 830 release history' },
  { table: 'INQUIRY',   poCol: 'FCCUSTPO',   label: 'Quote / Inquiry' },
  { table: 'FSOINPUT',  poCol: 'FCCUSTPO',   label: 'SO input staging' },
  { table: 'FSSERORD',  poCol: 'FCCUSTPO',   label: 'Field Service Order' },
  { table: 'FSWARNTY',  poCol: 'FCCUSTPO',   label: 'Warranty' },
  { table: 'SYCSLM',    poCol: 'FCCUSTPO',   label: 'Customer Service Log' },
  { table: 'SYRMAMA',   poCol: 'FCCUSTPO',   label: 'RMA Master' },
  { table: 'UPSMAST',   poCol: 'FCUSTPONO',  label: 'UPS shipping' },
  { table: 'CLIPOUT',   poCol: 'FCCUSTPONO', label: 'CLIPOUT (custom)' },
];

const MAX_POS_PER_REQUEST = 500;

module.exports = async function (context, req) {
  if (req.method === 'OPTIONS') {
    context.res = { status: 204 };
    return;
  }

  const connString = process.env.M2M_CONNECTION_STRING;
  if (!connString) {
    context.res = { status: 500, body: { error: 'M2M_CONNECTION_STRING not configured' } };
    return;
  }

  const body = req.body || {};
  const incoming = Array.isArray(body.wabtecPos) ? body.wabtecPos : [];
  const pos = [...new Set(incoming.map((p) => String(p || '').trim()).filter(Boolean))];

  if (pos.length === 0) {
    context.res = { status: 400, body: { error: 'wabtecPos required' } };
    return;
  }
  if (pos.length > MAX_POS_PER_REQUEST) {
    context.res = {
      status: 400,
      body: { error: `Too many POs (${pos.length}). Max ${MAX_POS_PER_REQUEST}.` },
    };
    return;
  }

  const started = Date.now();
  try {
    const pool = await getDbPool(connString);

    // Build one UNION ALL query so we only make a single round-trip and the
    // parameters are bound once. Each branch tags the row with its source
    // table so the caller knows where each hit came from.
    const paramNames = pos.map((_, i) => `@po${i}`);
    const inList = paramNames.join(',');

    const branches = TABLES.map(
      (t) => `
        SELECT
          '${t.table}' AS tableName,
          '${t.label.replace(/'/g, "''")}' AS tableLabel,
          LTRIM(RTRIM(${t.poCol})) AS wabtecPo,
          COUNT(*) AS hitCount
        FROM ${t.table}
        WHERE LTRIM(RTRIM(${t.poCol})) IN (${inList})
        GROUP BY LTRIM(RTRIM(${t.poCol}))
      `,
    );

    const query = `
      ${branches.join('\nUNION ALL\n')}
      ORDER BY wabtecPo, tableName;
    `;

    const request = pool.request();
    pos.forEach((po, i) => request.input(`po${i}`, sql.VarChar(20), po));

    const result = await request.query(query);
    const rows = result.recordset || [];
    const elapsed = Date.now() - started;

    // Group hits by PO for easy consumption.
    const byPo = {};
    for (const r of rows) {
      const p = (r.wabtecPo || '').trim();
      if (!byPo[p]) byPo[p] = [];
      byPo[p].push({ table: r.tableName, label: r.tableLabel, hitCount: r.hitCount });
    }

    const found = Object.keys(byPo);
    const missing = pos.filter((p) => !byPo[p]);

    context.log(
      `wabtec-po-find-everywhere: ${pos.length} POs across ${TABLES.length} tables, ` +
        `${rows.length} hits, ${found.length} POs found, ${missing.length} nowhere in M2M (${elapsed}ms)`,
    );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        requestedPos: pos.length,
        tablesSearched: TABLES.map((t) => t.table),
        totalHits: rows.length,
        posWithAtLeastOneHit: found.length,
        posWithNoHitAnywhere: missing.length,
        elapsedMs: elapsed,
        byPo,
        missing,
      },
    };
  } catch (err) {
    context.log.error('wabtec-po-find-everywhere error:', err);
    context.res = { status: 500, body: { error: err.message || String(err), stack: err.stack } };
  }
};
