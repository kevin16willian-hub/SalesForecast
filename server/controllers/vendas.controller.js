const sql = require('mssql');

const { getPool }       = require('../db/mssql');
const { FechamentoNow } = require('../utils/date');
const { getForecastTableByGrupoRegID } = require('../utils/forecastTable');
const cache             = require('../utils/cache');

// ── GET /api/workdays ────────────────────────────────────────────────────────
async function workdays(req, res) {
  try {
    const now       = new Date();
    const curYear    = now.getFullYear();
    const curMonth   = now.getMonth() + 1;
    const cacheKey   = `workdays:${curYear}:${curMonth}`;
    const cached     = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const db     = await getPool();
    const result = await db.request()
      .input('Year',  sql.Int, curYear)
      .input('Month', sql.Int, curMonth)
      .query(`
        SELECT x.*
        FROM BDISECC.dbo.SE_TRO_WorkDaysBR x WITH (NOLOCK)
        WHERE [Year] = @Year AND [Month] = @Month
      `);
    cache.set(cacheKey, result.recordset, 60 * 60 * 1000); // 1h
    res.json(result.recordset);
  } catch (err) {
    console.error('[GET /api/workdays]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── GET /api/vendas-mes-atual ────────────────────────────────────────────────
async function vendasMesAtual(req, res) {
  try {
    const grupoParam = Number(req.query.grupoRegID);
    const fechamento = FechamentoNow();

    const cacheKey = `vendas:mes:${grupoParam}:${fechamento}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const db     = await getPool();
    const result = await db.request()
      .input('GrupoRegID', sql.Int, grupoParam)
      .query(`
        WITH sg AS (
          SELECT DISTINCT SalesGroup, Marca
          FROM BDISECC.mapping.SM_TRG_SgPe WITH (NOLOCK)
          WHERE GrupoRegID = @GrupoRegID
        ),
        vendas_sg AS (
          SELECT v.Data, v.NetSales
          FROM BDISECC.dbo.SE_VFI_VendasporDiaMesAtual v WITH (NOLOCK)
          INNER JOIN sg ON sg.SalesGroup = v.SalesGroupRevisado
                       AND v.MarcaVenda  = sg.Marca
        )
        SELECT w.WeekOfMonth, SUM(vs.NetSales) AS NetSales
        FROM vendas_sg vs
        LEFT JOIN BDISECC.dbo.SE_TRO_WorkDaysBR w WITH (NOLOCK)
          ON  CAST(w.Year  AS INT) = YEAR(vs.Data)
          AND CAST(w.Month AS INT) = MONTH(vs.Data)
          AND CAST(w.Day   AS INT) = DAY(vs.Data)
        GROUP BY w.WeekOfMonth
      `);

    cache.set(cacheKey, result.recordset, 10 * 60 * 1000); // 10 min
    res.json(result.recordset);
  } catch (err) {
    console.error('[GET /api/vendas-mes-atual]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── GET /api/clientes-microregiao ────────────────────────────────────────────
async function clientesMicroregiao(req, res) {
  try {
    const db         = await getPool();
    const grupoParam = Number(req.query.grupoRegID);
    const mappingRes = await db.request()
      .input('GrupoRegID', sql.Int, grupoParam)
      .query(`
        SELECT SalesRepGrupoRegID, SalesGroup
        FROM BDISECC.mapping.SM_TRG_Mapping
        WHERE SalesRepGrupoRegID = @GrupoRegID
      `);
    const salesGroups = mappingRes.recordset.map(r => r.SalesGroup).filter(Boolean);
    if (salesGroups.length === 0) return res.json([]);

    const salesGroupsIn = salesGroups.map(sg => `'${String(sg).replace(/'/g, "''")}'`).join(',');
    const forecastTable = await getForecastTableByGrupoRegID(grupoParam, db);
    const raioXTable = forecastTable === 'SS_TFI_STBR_Forecast'
      ? 'SE_VRI_StraumannRaioXUltimo'
      : 'SE_VRI_NeodentRaioXUltimo';
    const clientesRes   = await db.request().query(`
      SELECT Organization, Nome, Classificacao
      FROM BDISECC.dbo.${raioXTable}
      WHERE SalesGroupCod IN (${salesGroupsIn})
    `);
    res.json(clientesRes.recordset);
  } catch (err) {
    console.error('[GET /api/clientes-microregiao]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

module.exports = { workdays, vendasMesAtual, clientesMicroregiao };
