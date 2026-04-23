const sql = require('mssql');

// Connection pool reused across invocations — same pattern as m2m-query.
// Saves 500-2000ms per call vs opening a fresh TCP connection.
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
    requestTimeout: 30000,
    pool: { max: 10, min: 1, idleTimeoutMillis: 60000 },
  });

  dbPools[connString] = pool.connect().then(() => pool).catch((err) => {
    delete dbPools[connString];
    throw err;
  });

  return dbPools[connString];
}

// SQL Server allows up to 2100 parameters per query. We cap safely below that.
const MAX_POS_PER_REQUEST = 2000;

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

  // Caller POSTs { wabtecPos: ["174517285", ...], scanRecentLimit?: 50000 }
  // Primary match: exact `LTRIM(RTRIM(FCUSTPONO)) IN (...)`.
  // Fallback: scan the last N SOMAST rows and return any whose FCUSTPONO
  // CONTAINS the PO as a substring — catches prefix/suffix/embedded PO
  // numbers the exact match misses.
  const body = req.body || {};
  const incoming = Array.isArray(body.wabtecPos) ? body.wabtecPos : [];
  const pos = [...new Set(incoming.map((p) => String(p || '').trim()).filter(Boolean))];
  const scanRecentLimit = Math.min(
    Math.max(parseInt(body.scanRecentLimit || '50000', 10) || 50000, 0),
    1000000,
  );

  if (pos.length === 0) {
    context.res = {
      status: 400,
      body: { error: 'wabtecPos array is required and must contain at least one PO' },
    };
    return;
  }
  if (pos.length > MAX_POS_PER_REQUEST) {
    context.res = {
      status: 400,
      body: {
        error: `Too many POs (${pos.length}). Max ${MAX_POS_PER_REQUEST} per request. Batch on the client if needed.`,
      },
    };
    return;
  }

  const started = Date.now();
  try {
    const pool = await getDbPool(connString);
    const request = pool.request();
    const paramNames = pos.map((_, i) => `@po${i}`);
    pos.forEach((po, i) => request.input(`po${i}`, sql.VarChar(20), po));

    // FCUSTPONO is Character(20) — padded with trailing spaces. Trim in SQL
    // before comparing so callers don't have to pad their inputs.
    // Ship-to address is pulled from SYADDR via FSHPTOADDR key + 'S' type.
    const query = `
      SELECT
          so.FCUSTPONO       AS wabtecPo,
          so.FSONO           AS macSo,
          so.FSTATUS         AS soStatus,
          so.FCANC_DT        AS cancelledDate,
          so.FCLOS_DT        AS closedDate,
          so.FORDERDATE      AS orderDate,
          si.FENUMBER        AS [lineNo],
          si.FPARTNO         AS item,
          si.FDESC           AS itemDesc,
          si.FQUANTITY       AS totalQty,
          si.FPRODCL         AS prodClass,
          si.FDUEDATE        AS promiseDate,
          si.FDREQUESTDATE   AS needByDate,
          si.FCITEMSTATUS    AS lineStatus,
          sr.FUNETPRICE      AS unitPrice,
          sr.FORDERQTY       AS releaseQty,
          (ISNULL(sr.FSHIPBOOK, 0) + ISNULL(sr.FSHIPBUY, 0) + ISNULL(sr.FSHIPMAKE, 0)) AS shippedQty,
          sa.FCCOMPANY       AS shipToCompany,
          sa.FCCITY          AS shipToCity,
          sa.FCSTATE         AS shipToState,
          sa.FCZIP           AS shipToZip
      FROM   SOMAST so
      INNER JOIN SOITEM si ON so.FSONO = si.FSONO
      LEFT  JOIN SORELS sr ON si.FSONO = sr.FSONO AND si.FINUMBER = sr.FINUMBER
      LEFT  JOIN SYADDR sa
             ON sa.FCALIASKEY = so.FCUSTNO
            AND sa.FCADDRKEY  = so.FSHPTOADDR
            AND sa.FCADDRTYPE = 'S'
      WHERE  LTRIM(RTRIM(so.FCUSTPONO)) IN (${paramNames.join(',')})
      ORDER BY so.FCUSTPONO, si.FENUMBER;
    `;

    const result = await request.query(query);
    const primaryRows = result.recordset.map((r) => ({ ...normalize(r), matchedBy: 'poNumber' }));

    // Secondary: for POs with no primary match, substring-scan the most
    // recent `scanRecentLimit` SOs. Finds cases where FCUSTPONO contains
    // the PO with a prefix ("W-174496878"), trailing suffix, or other
    // formatting the exact-match query doesn't tolerate.
    const matchedPos = new Set(primaryRows.map((r) => r.wabtecPo));
    const unmatched = pos.filter((p) => !matchedPos.has(p));

    let fallbackRows = [];
    if (unmatched.length > 0 && scanRecentLimit > 0) {
      const fbRequest = pool.request();
      fbRequest.input('fbLimit', sql.Int, scanRecentLimit);
      const fbParamNames = unmatched.map((_, i) => `@fbpo${i}`);
      unmatched.forEach((po, i) => fbRequest.input(`fbpo${i}`, sql.VarChar(20), po));

      // OR CHARINDEX clause per missing PO — SQL Server handles hundreds
      // fine. CTE narrows SOMAST to the N most recent before the scan
      // happens, keeping runtime bounded.
      const orClauses = fbParamNames
        .map((n) => `CHARINDEX(${n}, so.FCUSTPONO) > 0`)
        .join(' OR ');

      const fbQuery = `
        WITH recent_so AS (
          SELECT TOP (@fbLimit)
                 FSONO, FCUSTPONO, FSTATUS, FCANC_DT, FCLOS_DT, FORDERDATE,
                 FCUSTNO, FSHPTOADDR
          FROM   SOMAST
          ORDER BY FORDERDATE DESC
        )
        SELECT
            so.FCUSTPONO       AS wabtecPo,
            so.FSONO           AS macSo,
            so.FSTATUS         AS soStatus,
            so.FCANC_DT        AS cancelledDate,
            so.FCLOS_DT        AS closedDate,
            so.FORDERDATE      AS orderDate,
            si.FENUMBER        AS [lineNo],
            si.FPARTNO         AS item,
            si.FDESC           AS itemDesc,
            si.FQUANTITY       AS totalQty,
            si.FPRODCL         AS prodClass,
            si.FDUEDATE        AS promiseDate,
            si.FDREQUESTDATE   AS needByDate,
            si.FCITEMSTATUS    AS lineStatus,
            sr.FUNETPRICE      AS unitPrice,
            sr.FORDERQTY       AS releaseQty,
            (ISNULL(sr.FSHIPBOOK, 0) + ISNULL(sr.FSHIPBUY, 0) + ISNULL(sr.FSHIPMAKE, 0)) AS shippedQty,
            sa.FCCOMPANY       AS shipToCompany,
            sa.FCCITY          AS shipToCity,
            sa.FCSTATE         AS shipToState,
            sa.FCZIP           AS shipToZip
        FROM   recent_so so
        INNER JOIN SOITEM si ON so.FSONO = si.FSONO
        LEFT  JOIN SORELS sr ON si.FSONO = sr.FSONO AND si.FINUMBER = sr.FINUMBER
        LEFT  JOIN SYADDR sa
               ON sa.FCALIASKEY = so.FCUSTNO
              AND sa.FCADDRKEY  = so.FSHPTOADDR
              AND sa.FCADDRTYPE = 'S'
        WHERE  ${orClauses}
        ORDER BY so.FORDERDATE DESC, si.FENUMBER;
      `;

      const fbResult = await fbRequest.query(fbQuery);
      const rawFb = fbResult.recordset.map(normalize);

      // Each returned row's FCUSTPONO contains at least one of the unmatched
      // POs as a substring. Map each row back to whichever of our POs it
      // matches and tag with matchedBy='substring'. A single SO row can
      // belong to multiple target POs if the FCUSTPONO happens to contain
      // more than one (rare but possible).
      for (const row of rawFb) {
        const custPo = (row.wabtecPo || '').toLowerCase();
        for (const target of unmatched) {
          if (custPo.includes(target.toLowerCase())) {
            fallbackRows.push({ ...row, wabtecPo: target, matchedBy: 'substring' });
          }
        }
      }
    }

    const rows = [...primaryRows, ...fallbackRows];
    const elapsed = Date.now() - started;

    context.log(
      `wabtec-po-compare: ${pos.length} POs — ${primaryRows.length} exact-match rows, ` +
        `${fallbackRows.length} substring-match rows (${unmatched.length} POs scanned against last ${scanRecentLimit} SOs), ` +
        `total ${rows.length} in ${elapsed}ms`,
    );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        requestedPos: pos.length,
        count: rows.length,
        primaryCount: primaryRows.length,
        fallbackCount: fallbackRows.length,
        elapsedMs: elapsed,
        generatedAt: new Date().toISOString(),
        rows,
      },
    };
  } catch (err) {
    context.log.error('wabtec-po-compare error:', err);
    context.res = { status: 500, body: { error: err.message || String(err) } };
  }
};

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // M2M is FoxPro-derived and uses sentinel dates (0001-01-01, 1900-01-01)
  // to represent "unset" Date fields rather than storing real NULL.
  if (d.getFullYear() < 1990) return null;
  return d.toISOString();
}

function normalize(r) {
  const cancelledDate = toIso(r.cancelledDate);
  const closedDate = toIso(r.closedDate);
  return {
    wabtecPo: String(r.wabtecPo || '').trim(),
    macSo: String(r.macSo || '').trim(),
    soStatus: String(r.soStatus || '').trim(),
    cancelledDate,
    closedDate,
    orderDate: toIso(r.orderDate),
    lineNo: String(r.lineNo || '').trim(),
    item: String(r.item || '').trim(),
    itemDesc: r.itemDesc ? String(r.itemDesc).trim() : '',
    totalQty: Number(r.totalQty) || 0,
    prodClass: r.prodClass ? String(r.prodClass).trim() : '',
    promiseDate: toIso(r.promiseDate),
    needByDate: toIso(r.needByDate),
    lineStatus: r.lineStatus ? String(r.lineStatus).trim() : null,
    unitPrice: Number(r.unitPrice) || 0,
    releaseQty: Number(r.releaseQty) || 0,
    shippedQty: Number(r.shippedQty) || 0,
    shipToCompany: r.shipToCompany ? String(r.shipToCompany).trim() : '',
    shipToCity: r.shipToCity ? String(r.shipToCity).trim() : '',
    shipToState: r.shipToState ? String(r.shipToState).trim() : '',
    shipToZip: r.shipToZip ? String(r.shipToZip).trim() : '',
    isActive: !cancelledDate && !closedDate,
  };
}
