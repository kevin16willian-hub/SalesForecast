const sql  = require('mssql');
const xlsx = require('xlsx');

const { getPool }                                         = require('../db/mssql');
const { formatBR, FechamentoNow, getUpdateDateNow }       = require('../utils/date');
const { getForecastTableByGrupoRegID, getForecastBrandCodeByGrupoRegID, getForecastBrandCodeByEmail, getUserAssessorIDs, canAccessGrupoRegID } = require('../utils/forecastTable');
const cache                                               = require('../utils/cache');

// TTL do cache para leituras de forecast (3 minutos)
const FORECAST_CACHE_TTL    = 3 * 60 * 1000;
// TTL do cache para resumo de assessores (5 minutos)
const RESUMO_CACHE_TTL      = 5 * 60 * 1000;

// ── GET /api/forecast/all ────────────────────────────────────────────────────
async function getAll(req, res) {
  try {
    const db            = await getPool();
    const email         = req.user && req.user.email;
    const fechamento    = FechamentoNow();
    const grupoParam    = Number(req.query.grupoRegID);
    if (!grupoParam || !Number.isFinite(grupoParam)) {
      return res.status(400).json({ error: 'grupoRegID_required' });
    }
    if (!await canAccessGrupoRegID(email, grupoParam, db)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const forecastTable = await getForecastTableByGrupoRegID(grupoParam, db);

    const raioXTable = forecastTable === 'SS_TFI_STBR_Forecast'
      ? 'SE_VRI_StraumannRaioXUltimo'
      : 'SE_VRI_NeodentRaioXUltimo';

    const cacheKey = `forecast:all:${grupoParam}:${fechamento}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.request()
      .input('fechamento', sql.NVarChar(6), fechamento)
      .input('GrupoRegID', sql.Int, grupoParam)
      .query(`
      WITH latest AS (
        SELECT
          x.ForecastID, x.GrupoRegID, x.Fechamento, x.Marca, x.Tipo, x.Acao,
          x.CodLin, x.CodCliente, x.Valor1, x.Valor2, x.Valor3, x.Valor4, x.Valor5,
          x.Valor0, x.Observacao, x.UpdateUnumber, x.UpdateDate,
          ROW_NUMBER() OVER (PARTITION BY x.CodCliente ORDER BY x.UpdateDate DESC) AS rn
        FROM BDISECC.sandbox.${forecastTable} x WITH (NOLOCK)
        WHERE x.GrupoRegID = @GrupoRegID AND x.Fechamento = @fechamento
      ),
      active AS (
        SELECT * FROM latest WHERE rn = 1 AND Acao = 'ADD'
      ),
      vendas AS (
        SELECT v.CodSAP, SUM(v.NetSales) AS TotalNetSales
        FROM BDISECC.dbo.SE_VFI_VendasporDiaMesAtual v WITH (NOLOCK)
        INNER JOIN (
          SELECT DISTINCT SalesGroup, Marca FROM BDISECC.mapping.SM_TRG_SgPe WITH (NOLOCK)
          WHERE GrupoRegID = @GrupoRegID
        ) sg ON sg.SalesGroup = v.SalesGroupRevisado
          AND v.MarcaVenda = sg.Marca
        GROUP BY v.CodSAP
      ),
      raioX AS (
        SELECT r.Organization,
          MIN(r.UltimaVisita)  AS UltimaVisita,
          MIN(r.ProximaVisita) AS ProximaVisita,
          MIN(r.Classificacao) AS Classificacao,
          MIN(r.Bloco)        AS Bloco,
          MIN(r.Nome)          AS Nome
        FROM BDISECC.dbo.${raioXTable} r WITH (NOLOCK)
        WHERE r.Organization IN (SELECT CodCliente FROM active)
        GROUP BY r.Organization
      )
      SELECT
        t.ForecastID, t.GrupoRegID, t.Fechamento, t.Marca, t.Tipo, t.Acao,
        t.CodLin, t.CodCliente, t.Valor1, t.Valor2, t.Valor3, t.Valor4, t.Valor5,
        t.Valor0, t.Observacao, t.UpdateUnumber, t.UpdateDate,
        rx.Nome, rx.UltimaVisita, rx.ProximaVisita, rx.Classificacao,
        rx.Bloco,
        v.TotalNetSales AS ActualNetSales
      FROM active t
      LEFT JOIN raioX rx ON rx.Organization = t.CodCliente
      LEFT JOIN vendas v  ON v.CodSAP        = t.CodCliente
    `);

    const mapped = result.recordset.map((item, idx) => ({
      Lin:                     idx + 1,
      CodLin:                  item.CodLin ?? null,
      Organization:            item.CodCliente ?? null,
      NomeCliente:             item.Nome ?? null,
      UltimaVisitaPresencial:  formatBR(item.UltimaVisita) ?? null,
      ProximaVisitaPresencial: formatBR(item.ProximaVisita) ?? null,
      Classificacao:           item.Classificacao ?? null,
      Bloco:                    item.Bloco ?? null,
      ActualNetSales:          item.ActualNetSales != null ? Number(Number(item.ActualNetSales).toFixed(2)) : null,
      ForecastNetSalesMes:     Number((
        Number(item.Valor1 ?? 0) + Number(item.Valor2 ?? 0) +
        Number(item.Valor3 ?? 0) + Number(item.Valor4 ?? 0) + Number(item.Valor5 ?? 0)
      ).toFixed(2)),
      S1:                item.Valor1 != null ? Number(Number(item.Valor1).toFixed(2)) : null,
      S2:                item.Valor2 != null ? Number(Number(item.Valor2).toFixed(2)) : null,
      S3:                item.Valor3 != null ? Number(Number(item.Valor3).toFixed(2)) : null,
      S4:                item.Valor4 != null ? Number(Number(item.Valor4).toFixed(2)) : null,
      S5:                item.Valor5 != null ? Number(Number(item.Valor5).toFixed(2)) : null,
      PercentualConversao: item.Valor0 ?? null,
      Tipo:              item.Observacao ?? null,
    }));

    cache.set(cacheKey, mapped, FORECAST_CACHE_TTL);
    res.json(mapped);
  } catch (err) {
    console.error('[GET /api/forecast/all]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── GET /api/forecast/target ─────────────────────────────────────────────────
async function getTarget(req, res) {
  try {
    const db         = await getPool();
    const email      = req.user && req.user.email;
    const fechamento = FechamentoNow();
    const grupoParam = Number(req.query.grupoRegID);
    if (!grupoParam || !Number.isFinite(grupoParam)) {
      return res.status(400).json({ error: 'grupoRegID_required' });
    }
    if (!await canAccessGrupoRegID(email, grupoParam, db)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const result = await db.request()
      .input('fechamento', sql.NVarChar(6), fechamento)
      .input('GrupoRegID', sql.Int, grupoParam)
      .query(`
        SELECT x.*
        FROM BDISECC.sandbox.SS_TFI_Forecast_Target x
        WHERE x.Fechamento = @fechamento
          AND x.GrupoRegID = @GrupoRegID
          AND x.TipoFc NOT IN (N'S1',N'S2',N'S3',N'S4',N'S5')
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[GET /api/forecast/target]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── GET /api/forecast/target-semanas ─────────────────────────────────────────
async function getTargetSemanas(req, res) {
  try {
    const db         = await getPool();
    const email      = req.user && req.user.email;
    const fechamento = FechamentoNow();
    const grupoParam = Number(req.query.grupoRegID);
    if (!grupoParam || !Number.isFinite(grupoParam)) return res.json([]);
    if (!await canAccessGrupoRegID(email, grupoParam, db)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const brandCode = await getForecastBrandCodeByEmail(email, db);
    const brandName  = brandCode === 'STR' ? 'STRAUMANN' : 'NEODENT';
    const result = await db.request()
      .input('fechamento', sql.NVarChar(6), fechamento)
      .input('GrupoRegID', sql.Int, grupoParam)
      .input('BrandCode', sql.NVarChar(10), brandCode)
      .input('BrandName', sql.NVarChar(20), brandName)
      .query(`
        SELECT x.*
        FROM BDISECC.sandbox.SS_TFI_Forecast_Target x
        WHERE x.Fechamento = @fechamento
          AND x.TipoFc IN (N'S1',N'S2',N'S3',N'S4',N'S5')
          AND (
            UPPER(LTRIM(RTRIM(x.Marca))) = @BrandCode
            OR UPPER(LTRIM(RTRIM(x.Marca))) = @BrandName
          )
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[GET /api/forecast/target-semanas]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── POST /api/forecast/target/upload ─────────────────────────────────────────
async function uploadTarget(req, res) {
  try {
    const rows = Array.isArray(req.body) ? req.body : (Array.isArray(req.body.rows) ? req.body.rows : null);
    if (!rows) return res.status(400).json({ error: 'invalid_payload', message: 'Expected an array of rows in the request body' });

    const requiredCols = ['Fechamento','Marca','Tipo','GrupoRegID','Unumber','TipoFC','Target','Observacoes','UpdateUnumber','UpdateDate'];
    const errors   = [];
    const toInsert = [];

    rows.forEach((r, idx) => {
      if (!r || typeof r !== 'object') { errors.push({ row: idx, error: 'not_object' }); return; }
      const missing = requiredCols.filter(c => !Object.prototype.hasOwnProperty.call(r, c));
      if (missing.length) { errors.push({ row: idx, error: 'missing_columns', missing }); return; }
      const GrupoRegID = Number(r.GrupoRegID);
      const Target     = Number(r.Target);
      if (!Number.isFinite(GrupoRegID)) { errors.push({ row: idx, error: 'invalid_GrupoRegID', value: r.GrupoRegID }); return; }
      if (!Number.isFinite(Target))     { errors.push({ row: idx, error: 'invalid_Target',     value: r.Target     }); return; }
      toInsert.push({
        Fechamento:    String(r.Fechamento),
        Marca:         String(r.Marca),
        Tipo:          String(r.Tipo),
        GrupoRegID,
        Unumber:       String(r.Unumber),
        TipoFC:        String(r.TipoFC),
        Target,
        Observacoes:   r.Observacoes   == null ? null : String(r.Observacoes),
        UpdateUnumber: String(r.UpdateUnumber),
        UpdateDate:    String(r.UpdateDate),
      });
    });

    if (errors.length) return res.status(400).json({ error: 'validation_failed', details: errors });

    const db      = await getPool();
    const email   = req.user && req.user.email;
    const uniqueGrupos = [...new Set(toInsert.map(r => r.GrupoRegID))];
    const denied = [];
    for (const gid of uniqueGrupos) {
      if (!await canAccessGrupoRegID(email, gid, db)) denied.push(gid);
    }
    if (denied.length) return res.status(403).json({ error: 'forbidden', denied });

    const results = [];
    for (const row of toInsert) {
      const insertRes = await db.request()
        .input('Fechamento',    sql.NVarChar(50),    row.Fechamento)
        .input('Marca',         sql.NVarChar(50),    row.Marca)
        .input('Tipo',          sql.NVarChar(50),    row.Tipo)
        .input('GrupoRegID',    sql.Int,             row.GrupoRegID)
        .input('Unumber',       sql.NVarChar(255),   row.Unumber)
        .input('TipoFc',        sql.NVarChar(50),    row.TipoFC)
        .input('Target',        sql.Decimal(24, 4),  row.Target)
        .input('Observacoes',   sql.NVarChar(1000),  row.Observacoes)
        .input('UpdateUnumber', sql.NVarChar(255),   row.UpdateUnumber)
        .input('UpdateDate',    sql.NVarChar(14),    row.UpdateDate)
        .query(`
          INSERT INTO BDISECC.sandbox.SS_TFI_Forecast_Target
            (Fechamento, Marca, Tipo, GrupoRegID, Unumber, TipoFc, Target, Observacoes, UpdateUnumber, UpdateDate)
          VALUES
            (@Fechamento, @Marca, @Tipo, @GrupoRegID, @Unumber, @TipoFc, @Target, @Observacoes, @UpdateUnumber, @UpdateDate);
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS InsertedID;
        `);
      const insertedId = insertRes?.recordset?.[0]?.InsertedID;
      results.push({ ok: true, InsertedID: insertedId });
    }
    res.json({ ok: true, inserted: results.length, results });
  } catch (err) {
    console.error('[POST /api/forecast/target/upload]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── POST /api/forecast/inserir-del ───────────────────────────────────────────
async function inserirDel(req, res) {
  try {
    const db         = await getPool();
    const email      = req.user && req.user.email;
    const grupoParam = Number(req.query.grupoRegID) || Number(req.body && req.body.grupoRegID) || NaN;
    if (!grupoParam || !Number.isFinite(grupoParam)) {
      console.error('[POST /api/forecast/inserir-del] grupoRegID ausente ou inválido:', req.query.grupoRegID);
      return res.status(400).json({ error: 'grupoRegID_required', message: 'Envie ?grupoRegID= na URL' });
    }
    if (!await canAccessGrupoRegID(email, grupoParam, db)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const forecastTable = await getForecastTableByGrupoRegID(grupoParam, db);
    const grupoRes = await db.request()
      .input('GrupoRegID', sql.Int, grupoParam)
      .query(`SELECT GrupoRegID, Unumber FROM BDISECC.mapping.SM_TRG_GrPe WHERE GrupoRegID = @GrupoRegID`);
    const unumber = grupoRes.recordset[0]?.Unumber;
    if (!unumber) {
      console.error('[POST /api/forecast/inserir-del] Unumber não encontrado para GrupoRegID:', grupoParam);
      return res.status(404).json({ error: `Unumber não encontrado para GrupoRegID ${grupoParam}` });
    }

    const bodyOrgs = [];
    if (Array.isArray(req.body && req.body.Organizations)) {
      req.body.Organizations.forEach(o => { if (o) bodyOrgs.push(String(o)); });
    } else if (req.body && req.body.Organization) {
      bodyOrgs.push(String(req.body.Organization));
    }
    if (bodyOrgs.length === 0) return res.status(400).json({ error: 'missing_Organization' });

    const GrupoRegID     = grupoParam;
    const Fechamento     = FechamentoNow();
    const UpdateUnumber  = unumber;
    const UpdateDateBase = getUpdateDateNow();
    const marcaCode      = await getForecastBrandCodeByGrupoRegID(GrupoRegID, db);
    const results        = [];

    for (const org of bodyOrgs) {
      const CodCliente = String(org);
      console.log('[POST /api/forecast/inserir-del] payload organization:', CodCliente);

      const existingRes = await db.request()
        .input('GrupoRegID', sql.Int,           GrupoRegID)
        .input('Fechamento', sql.NVarChar(255), Fechamento)
        .input('CodCliente', sql.NVarChar(255), CodCliente)
        .query(`
          WITH latest AS (
            SELECT
              x.ForecastID, x.CodCliente, x.Acao, x.UpdateDate,
              ROW_NUMBER() OVER (
                PARTITION BY x.CodCliente
                ORDER BY x.UpdateDate DESC, x.ForecastID DESC
              ) AS rn
            FROM BDISECC.sandbox.${forecastTable} x WITH (NOLOCK)
            WHERE x.GrupoRegID = @GrupoRegID
              AND x.Fechamento = @Fechamento
              AND x.CodCliente = @CodCliente
          )
          SELECT ForecastID, Acao, UpdateDate
          FROM latest
          WHERE rn = 1;
        `);

      const existing = existingRes?.recordset?.[0];
      if (existing && String(existing.Acao || '').toUpperCase() === 'DEL') {
        console.log('[POST /api/forecast/inserir-del] already deleted:', {
          CodCliente,
          ForecastID: existing.ForecastID,
          UpdateDate: existing.UpdateDate,
        });
        results.push({ Organization: CodCliente, ok: true, duplicated: true, ForecastID: existing.ForecastID });
        continue;
      }

      const insertRes = await db.request()
        .input('GrupoRegID',    sql.Int,           GrupoRegID)
        .input('Fechamento',    sql.NVarChar(255), Fechamento)
        .input('Marca',         sql.NVarChar(255), marcaCode)
        .input('Tipo',          sql.NVarChar(255), 'ACE')
        .input('Acao',          sql.NVarChar(255), 'DEL')
        .input('CodLin',        sql.NVarChar(255), 'CXX')
        .input('CodCliente',    sql.NVarChar(255), CodCliente)
        .input('UpdateUnumber', sql.NVarChar(255), UpdateUnumber)
        .input('UpdateDate',    sql.NVarChar(14),  UpdateDateBase)
        .query(`
          INSERT INTO BDISECC.sandbox.${forecastTable}
            (GrupoRegID, Fechamento, Marca, Tipo, Acao, CodLin, CodCliente, UpdateUnumber, UpdateDate)
          VALUES
            (@GrupoRegID, @Fechamento, @Marca, @Tipo, @Acao, @CodLin, @CodCliente, @UpdateUnumber, @UpdateDate);
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS ForecastID;
        `);
      const insertedId = insertRes?.recordset?.[0]?.ForecastID;
      console.log('[POST /api/forecast/inserir-del] inserted', { CodCliente, ForecastID: insertedId });
      results.push({ Organization: CodCliente, ok: true, ForecastID: insertedId });
    }
    cache.delByPrefix(`forecast:all:${grupoParam}:`);
    res.json({ ok: true, results });
  } catch (err) {
    console.error('[POST /api/forecast/inserir-del]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── POST /api/forecast/inserir-add ───────────────────────────────────────────
async function inserirAdd(req, res) {
  try {
    const db         = await getPool();
    const email      = req.user && req.user.email;
    const grupoParam = Number(req.query.grupoRegID);
    if (!grupoParam || !Number.isFinite(grupoParam)) {
      return res.status(400).json({ error: 'grupoRegID_required' });
    }
    if (!await canAccessGrupoRegID(email, grupoParam, db)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const forecastTable = await getForecastTableByGrupoRegID(grupoParam, db);
    const grupoRes   = await db.request()
      .input('GrupoRegID', sql.Int, grupoParam)
      .query(`SELECT GrupoRegID, Unumber FROM BDISECC.mapping.SM_TRG_GrPe WHERE GrupoRegID = @GrupoRegID`);
    const unumber = grupoRes.recordset[0]?.Unumber;
    if (!unumber) return res.status(404).json({ error: `Unumber não encontrado para GrupoRegID ${grupoParam}` });

    const Fechamento = FechamentoNow();
    const codLinRes  = await db.request()
      .input('GrupoRegID', sql.Int,           grupoParam)
      .input('Fechamento', sql.NVarChar(255), Fechamento)
      .query(`SELECT CodLin FROM BDISECC.sandbox.${forecastTable} WHERE GrupoRegID = @GrupoRegID AND Fechamento = @Fechamento`);

    let maxNum = 0;
    for (const row of codLinRes.recordset) {
      const match = /^C(\d+)$/.exec(row.CodLin);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const proxCodLin = `C${maxNum + 1}`;
    const hasProvidedCodLin = req.body && req.body.CodLin != null && String(req.body.CodLin).trim() !== '';
    const CodLin = hasProvidedCodLin ? String(req.body.CodLin) : proxCodLin;
    const CodCliente = req.body && req.body.CodCliente ? String(req.body.CodCliente) : null;
    if (!CodCliente) return res.status(400).json({ error: 'missing_CodCliente' });
    const marcaCode  = await getForecastBrandCodeByGrupoRegID(grupoParam, db);
    const Valor1     = req.body?.Valor1 != null ? Number(req.body.Valor1) : null;
    const Valor2     = req.body?.Valor2 != null ? Number(req.body.Valor2) : null;
    const Valor3     = req.body?.Valor3 != null ? Number(req.body.Valor3) : null;
    const Valor4     = req.body?.Valor4 != null ? Number(req.body.Valor4) : null;
    const Valor5     = req.body?.Valor5 != null ? Number(req.body.Valor5) : null;
    const Valor0     = req.body?.Valor0 != null ? Number(req.body.Valor0) : null;
    const Observacao = req.body?.Observacao ? String(req.body.Observacao) : 'Visita';

    const sameNumber = (left, right) => {
      if (left == null && right == null) return true;
      if (left == null || right == null) return false;
      return Number(left) === Number(right);
    };
    const sameText = (left, right) => String(left ?? '') === String(right ?? '');

    const duplicateQuery = hasProvidedCodLin
      ? await db.request()
          .input('GrupoRegID', sql.Int,           grupoParam)
          .input('Fechamento', sql.NVarChar(255), Fechamento)
          .input('CodCliente', sql.NVarChar(255), CodCliente)
          .input('CodLin',     sql.NVarChar(255), CodLin)
          .query(`
            WITH latest AS (
              SELECT
                x.ForecastID, x.CodCliente, x.CodLin, x.Acao, x.Valor0,
                x.Valor1, x.Valor2, x.Valor3, x.Valor4, x.Valor5,
                x.Observacao, x.UpdateDate,
                ROW_NUMBER() OVER (
                  PARTITION BY x.CodCliente, x.CodLin
                  ORDER BY x.UpdateDate DESC, x.ForecastID DESC
                ) AS rn
              FROM BDISECC.sandbox.${forecastTable} x WITH (NOLOCK)
              WHERE x.GrupoRegID = @GrupoRegID
                AND x.Fechamento = @Fechamento
                AND x.CodCliente = @CodCliente
                AND x.CodLin = @CodLin
            )
            SELECT ForecastID, CodCliente, CodLin, Acao, Valor0, Valor1, Valor2, Valor3, Valor4, Valor5, Observacao, UpdateDate
            FROM latest
            WHERE rn = 1;
          `)
      : await db.request()
          .input('GrupoRegID', sql.Int,           grupoParam)
          .input('Fechamento', sql.NVarChar(255), Fechamento)
          .input('CodCliente', sql.NVarChar(255), CodCliente)
          .query(`
            WITH latest AS (
              SELECT
                x.ForecastID, x.CodCliente, x.Acao, x.UpdateDate,
                ROW_NUMBER() OVER (
                  PARTITION BY x.CodCliente
                  ORDER BY x.UpdateDate DESC, x.ForecastID DESC
                ) AS rn
              FROM BDISECC.sandbox.${forecastTable} x WITH (NOLOCK)
              WHERE x.GrupoRegID = @GrupoRegID
                AND x.Fechamento = @Fechamento
            )
            SELECT ForecastID, UpdateDate
            FROM latest
            WHERE rn = 1
              AND Acao = 'ADD'
              AND CodCliente = @CodCliente;
          `);

    const duplicateRow = duplicateQuery?.recordset?.[0];
    if (hasProvidedCodLin && duplicateRow && String(duplicateRow.Acao || '').toUpperCase() === 'ADD') {
      const isSamePayload =
        sameNumber(duplicateRow.Valor0, Valor0) &&
        sameNumber(duplicateRow.Valor1, Valor1) &&
        sameNumber(duplicateRow.Valor2, Valor2) &&
        sameNumber(duplicateRow.Valor3, Valor3) &&
        sameNumber(duplicateRow.Valor4, Valor4) &&
        sameNumber(duplicateRow.Valor5, Valor5) &&
        sameText(duplicateRow.Observacao, Observacao);

      if (isSamePayload) {
        console.log('[POST /api/forecast/inserir-add] duplicate edit retry ignored:', {
          ForecastID: duplicateRow.ForecastID,
          CodLin,
          CodCliente,
          UpdateDate: duplicateRow.UpdateDate,
        });
        return res.json({ ok: true, duplicated: true, proxCodLin, CodCliente, ForecastID: duplicateRow.ForecastID });
      }
    }

    if (!hasProvidedCodLin) {
      const duplicateForecastId = duplicateRow?.ForecastID;
      if (duplicateForecastId != null) {
        console.log('[POST /api/forecast/inserir-add] duplicate active row:', {
          ForecastID: duplicateForecastId,
          CodLin,
          CodCliente,
          UpdateDate: duplicateRow.UpdateDate,
        });
        return res.json({ ok: true, duplicated: true, proxCodLin, CodCliente, ForecastID: duplicateForecastId });
      }
    }

    const UpdateDate = getUpdateDateNow();

    console.log('[POST /api/forecast/inserir-add] payload:', req.body);
    console.log('[POST /api/forecast/inserir-add] params:', {
      GrupoRegID: grupoParam, Fechamento, CodLin, CodCliente, UpdateDate, Observacao,
      Valor1, Valor2, Valor3, Valor4, Valor5,
    });

    const insertResult = await db.request()
      .input('GrupoRegID',    sql.Int,           grupoParam)
      .input('Fechamento',    sql.NVarChar(255), Fechamento)
      .input('Marca',         sql.NVarChar(255), marcaCode)
      .input('Tipo',          sql.NVarChar(255), 'ACE')
      .input('Acao',          sql.NVarChar(255), 'ADD')
      .input('CodLin',        sql.NVarChar(255), CodLin)
      .input('CodCliente',    sql.NVarChar(255), CodCliente)
      .input('UpdateUnumber', sql.NVarChar(255), unumber)
      .input('UpdateDate',    sql.NVarChar(14),  UpdateDate)
      .input('Observacao',    sql.NVarChar(255), Observacao)
      .input('Valor0',        sql.Decimal(24, 4), Valor0)
      .input('Valor1',        sql.Decimal(24, 4), Valor1)
      .input('Valor2',        sql.Decimal(24, 4), Valor2)
      .input('Valor3',        sql.Decimal(24, 4), Valor3)
      .input('Valor4',        sql.Decimal(24, 4), Valor4)
      .input('Valor5',        sql.Decimal(24, 4), Valor5)
      .query(`
        INSERT INTO BDISECC.sandbox.${forecastTable}
          (GrupoRegID, Fechamento, Marca, Tipo, Acao, CodLin, CodCliente, UpdateUnumber, UpdateDate, Observacao,
           Valor0, Valor1, Valor2, Valor3, Valor4, Valor5)
        VALUES
          (@GrupoRegID, @Fechamento, @Marca, @Tipo, @Acao, @CodLin, @CodCliente, @UpdateUnumber, @UpdateDate, @Observacao,
           @Valor0, @Valor1, @Valor2, @Valor3, @Valor4, @Valor5);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS ForecastID;
      `);
    const insertedForecastId = insertResult?.recordset?.[0]?.ForecastID;
    console.log('[POST /api/forecast/inserir-add] inserted:', { ForecastID: insertedForecastId, CodLin, CodCliente, UpdateDate });
    cache.delByPrefix(`forecast:all:${grupoParam}:`);
    res.json({ ok: true, proxCodLin, CodCliente, ForecastID: insertedForecastId });
  } catch (err) {
    console.error('[POST /api/forecast/inserir-add]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── POST /api/forecast/target/upload-file ────────────────────────────────────
async function uploadTargetFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const workbook  = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) return res.status(400).json({ error: 'empty_workbook' });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'no_rows' });

    const requiredCols   = ['Fechamento','Marca','Tipo','GrupoRegID','Unumber','TipoFC','Target','Observacoes','UpdateUnumber','UpdateDate'];
    const missingHeaders = requiredCols.filter(c => !Object.prototype.hasOwnProperty.call(rows[0], c));
    if (missingHeaders.length) return res.status(400).json({ error: 'missing_headers', missing: missingHeaders });

    const errors   = [];
    const toInsert = [];
    rows.forEach((r, idx) => {
      const missing = requiredCols.filter(c => !Object.prototype.hasOwnProperty.call(r, c));
      if (missing.length) { errors.push({ row: idx, error: 'missing_columns', missing }); return; }
      const GrupoRegID = Number(r.GrupoRegID);
      const Target     = Number(r.Target);
      if (!Number.isFinite(GrupoRegID)) { errors.push({ row: idx, error: 'invalid_GrupoRegID', value: r.GrupoRegID }); return; }
      if (!Number.isFinite(Target))     { errors.push({ row: idx, error: 'invalid_Target',     value: r.Target     }); return; }
      toInsert.push({
        Fechamento:    String(r.Fechamento),
        Marca:         String(r.Marca),
        Tipo:          String(r.Tipo),
        GrupoRegID,
        Unumber:       r.Unumber      == null ? null : String(r.Unumber),
        TipoFC:        r.TipoFC       == null ? 'C'  : String(r.TipoFC),
        Target,
        Observacoes:   r.Observacoes   == null ? null : String(r.Observacoes),
        UpdateUnumber: r.UpdateUnumber == null ? null : String(r.UpdateUnumber),
        UpdateDate:    r.UpdateDate    == null ? null : String(r.UpdateDate),
      });
    });
    if (errors.length) return res.status(400).json({ error: 'validation_failed', details: errors });

    const db      = await getPool();
    const email   = req.user && req.user.email;
    const uniqueGrupos = [...new Set(toInsert.map(r => r.GrupoRegID))];
    const denied = [];
    for (const gid of uniqueGrupos) {
      if (!await canAccessGrupoRegID(email, gid, db)) denied.push(gid);
    }
    if (denied.length) return res.status(403).json({ error: 'forbidden', denied });

    const results = [];
    for (const row of toInsert) {
      const insertRes = await db.request()
        .input('Fechamento',    sql.NVarChar(255),  row.Fechamento)
        .input('Marca',         sql.NVarChar(255),  row.Marca)
        .input('Tipo',          sql.NVarChar(255),  row.Tipo)
        .input('GrupoRegID',    sql.Int,            row.GrupoRegID)
        .input('Unumber',       sql.NVarChar(255),  row.Unumber)
        .input('TipoFc',        sql.NVarChar(255),  row.TipoFC)
        .input('Target',        sql.Decimal(19, 9), row.Target)
        .input('Observacoes',   sql.NVarChar(2048), row.Observacoes)
        .input('UpdateUnumber', sql.NVarChar(255),  row.UpdateUnumber)
        .input('UpdateDate',    sql.NVarChar(14),   row.UpdateDate)
        .query(`
          INSERT INTO BDISECC.sandbox.SS_TFI_Forecast_Target
            (Fechamento, Marca, Tipo, GrupoRegID, Unumber, TipoFc, Target, Observacoes, UpdateUnumber, UpdateDate)
          VALUES
            (@Fechamento, @Marca, @Tipo, @GrupoRegID, @Unumber, @TipoFc, @Target, @Observacoes, @UpdateUnumber, @UpdateDate);
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS InsertedID;
        `);
      results.push({ ok: true, InsertedID: insertRes?.recordset?.[0]?.InsertedID });
    }
    res.json({ ok: true, inserted: results.length, results });
  } catch (err) {
    console.error('[POST /api/forecast/target/upload-file]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── POST /api/forecast/upload-file ───────────────────────────────────────────
async function uploadForecastFile(req, res) {
  const marcaParam = (req.query.marca || 'neodent').toLowerCase();
  const tableName  = marcaParam === 'straumann' ? 'SS_TFI_STBR_Forecast' : 'SS_TFI_NDBR_Forecast';
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const workbook  = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) return res.status(400).json({ error: 'empty_workbook' });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'no_rows' });

    const requiredCols = [
      'GrupoRegID','Fechamento','Marca','Tipo','Acao','CodLin','CodCliente',
      'Valor1','Valor2','Valor3','Valor4','Valor5','Valor6','Valor7','Valor8','Valor9','Valor0',
      'Acao1','Acao2','Acao3','Observacao','UpdateUnumber','UpdateDate',
    ];
    const missingHeaders = requiredCols.filter(c => !Object.prototype.hasOwnProperty.call(rows[0], c));
    if (missingHeaders.length) return res.status(400).json({ error: 'missing_headers', missing: missingHeaders });

    const errors   = [];
    const toInsert = [];
    rows.forEach((r, idx) => {
      if (!r || typeof r !== 'object') { errors.push({ row: idx, error: 'not_object' }); return; }
      const missing = requiredCols.filter(c => !Object.prototype.hasOwnProperty.call(r, c));
      if (missing.length) { errors.push({ row: idx, error: 'missing_columns', missing }); return; }
      const GrupoRegID = Number(r.GrupoRegID);
      if (!Number.isFinite(GrupoRegID)) { errors.push({ row: idx, error: 'invalid_GrupoRegID', value: r.GrupoRegID }); return; }

      const valorCols = {};
      for (let i = 1; i <= 9; i++) valorCols[`Valor${i}`] = (r[`Valor${i}`] == null || r[`Valor${i}`] === '') ? null : Number(r[`Valor${i}`]);
      valorCols['Valor0'] = (r['Valor0'] == null || r['Valor0'] === '') ? null : Number(r['Valor0']);
      for (const k of Object.keys(valorCols)) {
        const v = valorCols[k];
        if (v != null && !Number.isFinite(v)) { errors.push({ row: idx, error: 'invalid_numeric', column: k, value: r[k] }); return; }
      }

      toInsert.push({
        GrupoRegID,
        Fechamento:    String(r.Fechamento),
        Marca:         String(r.Marca),
        Tipo:          String(r.Tipo),
        Acao:          r.Acao          == null ? null : String(r.Acao),
        CodLin:        r.CodLin        == null ? null : String(r.CodLin),
        CodCliente:    r.CodCliente    == null ? null : String(r.CodCliente),
        ...valorCols,
        Acao1:         r.Acao1         == null ? null : String(r.Acao1),
        Acao2:         r.Acao2         == null ? null : String(r.Acao2),
        Acao3:         r.Acao3         == null ? null : String(r.Acao3),
        Observacao:    r.Observacao    == null ? null : String(r.Observacao),
        UpdateUnumber: r.UpdateUnumber == null ? null : String(r.UpdateUnumber),
        UpdateDate:    r.UpdateDate    == null ? null : String(r.UpdateDate),
      });
    });
    if (errors.length) return res.status(400).json({ error: 'validation_failed', details: errors });

    const db      = await getPool();
    const email   = req.user && req.user.email;
    const uniqueGrupos = [...new Set(toInsert.map(r => r.GrupoRegID))];
    const denied = [];
    for (const gid of uniqueGrupos) {
      if (!await canAccessGrupoRegID(email, gid, db)) denied.push(gid);
    }
    if (denied.length) return res.status(403).json({ error: 'forbidden', denied });

    const results = [];
    for (const row of toInsert) {
      const q = db.request()
        .input('GrupoRegID',    sql.Int,           row.GrupoRegID)
        .input('Fechamento',    sql.NVarChar(255), row.Fechamento)
        .input('Marca',         sql.NVarChar(255), row.Marca)
        .input('Tipo',          sql.NVarChar(255), row.Tipo)
        .input('Acao',          sql.NVarChar(255), row.Acao)
        .input('CodLin',        sql.NVarChar(255), row.CodLin)
        .input('CodCliente',    sql.NVarChar(255), row.CodCliente)
        .input('Valor1',        sql.Decimal(24, 4), row.Valor1)
        .input('Valor2',        sql.Decimal(24, 4), row.Valor2)
        .input('Valor3',        sql.Decimal(24, 4), row.Valor3)
        .input('Valor4',        sql.Decimal(24, 4), row.Valor4)
        .input('Valor5',        sql.Decimal(24, 4), row.Valor5)
        .input('Valor6',        sql.Decimal(24, 4), row.Valor6)
        .input('Valor7',        sql.Decimal(24, 4), row.Valor7)
        .input('Valor8',        sql.Decimal(24, 4), row.Valor8)
        .input('Valor9',        sql.Decimal(24, 4), row.Valor9)
        .input('Valor0',        sql.Decimal(24, 4), row.Valor0)
        .input('Acao1',         sql.NVarChar(1024), row.Acao1)
        .input('Acao2',         sql.NVarChar(1024), row.Acao2)
        .input('Acao3',         sql.NVarChar(1024), row.Acao3)
        .input('Observacao',    sql.NVarChar(2048), row.Observacao)
        .input('UpdateUnumber', sql.NVarChar(255),  row.UpdateUnumber)
        .input('UpdateDate',    sql.NVarChar(14),   row.UpdateDate);

      const insertRes = await q.query(`
        INSERT INTO BDISECC.sandbox.${tableName}
          (GrupoRegID, Fechamento, Marca, Tipo, Acao, CodLin, CodCliente,
           Valor1, Valor2, Valor3, Valor4, Valor5, Valor6, Valor7, Valor8, Valor9, Valor0,
           Acao1, Acao2, Acao3, Observacao, UpdateUnumber, UpdateDate)
        VALUES
          (@GrupoRegID, @Fechamento, @Marca, @Tipo, @Acao, @CodLin, @CodCliente,
           @Valor1, @Valor2, @Valor3, @Valor4, @Valor5, @Valor6, @Valor7, @Valor8, @Valor9, @Valor0,
           @Acao1, @Acao2, @Acao3, @Observacao, @UpdateUnumber, @UpdateDate);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS InsertedID;
      `);
      results.push({ ok: true, InsertedID: insertRes?.recordset?.[0]?.InsertedID });
    }
    res.json({ ok: true, inserted: results.length, results, table: tableName });
  } catch (err) {
    console.error('[POST /api/forecast/upload-file]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── GET /api/forecast/resumo-assessores ──────────────────────────────────────
async function resumoAssessores(req, res) {
  try {
    const db         = await getPool();
    const email      = req.user && req.user.email;
    const fechamento = FechamentoNow();
    const brandCode  = await getForecastBrandCodeByEmail(email, db);
    const brandName  = brandCode === 'STR' ? 'STRAUMANN' : 'NEODENT';

    const { filtroGrupoRegID, filtroGrupoRegIDs } = await getUserAssessorIDs(email, db);
    const isAdmin = !filtroGrupoRegID && !filtroGrupoRegIDs;

    // ── Cache ────────────────────────────────────────────────────────────────
    const cacheKey = `resumo:${email || 'admin'}:mixed:${fechamento}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.json(cached);

    let idWhereF = '', idWhereFInner = '', idWhereSG = '', idWhereT = '';
    if (filtroGrupoRegID) {
      const safeId  = Number(filtroGrupoRegID);
      idWhereF      = `AND f.GrupoRegID = ${safeId}`;
      idWhereFInner = `AND GrupoRegID = ${safeId}`;
      idWhereSG     = `AND sg.GrupoRegID = ${safeId}`;
      idWhereT      = `AND GrupoRegID = ${safeId}`;
    } else if (filtroGrupoRegIDs && filtroGrupoRegIDs.length > 0) {
      const safeList = filtroGrupoRegIDs.map(id => Number(id)).join(',');
      idWhereF      = `AND f.GrupoRegID IN (${safeList})`;
      idWhereFInner = `AND GrupoRegID IN (${safeList})`;
      idWhereSG     = `AND sg.GrupoRegID IN (${safeList})`;
      idWhereT      = `AND GrupoRegID IN (${safeList})`;
    }

    const forecastCTE = `
      SELECT f.*, ROW_NUMBER() OVER (PARTITION BY f.GrupoRegID, f.CodCliente ORDER BY f.UpdateDate DESC) AS rn
      FROM (
        SELECT GrupoRegID, CodCliente, UpdateDate, Fechamento, Acao, Valor0, Valor1, Valor2, Valor3, Valor4, Valor5
        FROM BDISECC.sandbox.SS_TFI_NDBR_Forecast WITH (NOLOCK)
        UNION ALL
        SELECT GrupoRegID, CodCliente, UpdateDate, Fechamento, Acao, Valor0, Valor1, Valor2, Valor3, Valor4, Valor5
        FROM BDISECC.sandbox.SS_TFI_STBR_Forecast WITH (NOLOCK)
      ) f
      WHERE f.Fechamento = @fechamento ${isAdmin || (filtroGrupoRegIDs && filtroGrupoRegIDs.length > 0) ? idWhereFInner : idWhereF}
    `;

    // ── Quatro queries em paralelo ─────────────────────────────────────────
    const [forecastRawRes, targetRes, targetWeekRes, vendasRawRes, wdaysRes] = await Promise.all([
      db.request()
          .input('fechamento', sql.NVarChar(6), fechamento)
          .query(`
            WITH latest AS (${forecastCTE})
            SELECT f.GrupoRegID, g.NomeSistema AS nome,
                   f.Valor0, f.Valor1, f.Valor2, f.Valor3, f.Valor4, f.Valor5
            FROM latest f
            JOIN BDISECC.mapping.SM_TRG_GrPe g WITH (NOLOCK) ON g.GrupoRegID = f.GrupoRegID
            WHERE f.rn = 1 AND f.Acao = 'ADD'
          `),
      db.request()
          .input('fechamento', sql.NVarChar(6), fechamento)
          .input('brandCode', sql.NVarChar(10), brandCode)
          .input('brandName', sql.NVarChar(20), brandName)
          .query(`
            SELECT GrupoRegID, SUM(Target) AS metaMes
            FROM BDISECC.sandbox.SS_TFI_Forecast_Target WITH (NOLOCK)
            WHERE Fechamento = @fechamento
              AND TipoFc NOT IN (N'S1',N'S2',N'S3',N'S4',N'S5')
              ${idWhereT}
            GROUP BY GrupoRegID
          `),
      // Metas semanais são gravadas globalmente por marca (sem GrupoRegID),
      // por isso não filtramos por idWhereT aqui.
      db.request()
          .input('fechamento', sql.NVarChar(6), fechamento)
          .input('brandCode', sql.NVarChar(10), brandCode)
          .input('brandName', sql.NVarChar(20), brandName)
          .query(`
            SELECT TipoFc, SUM(Target) AS Target
            FROM BDISECC.sandbox.SS_TFI_Forecast_Target WITH (NOLOCK)
            WHERE Fechamento = @fechamento
              AND UPPER(LTRIM(RTRIM(Marca))) IN (@brandCode, @brandName)
              AND TipoFc IN (N'S1',N'S2',N'S3',N'S4',N'S5')
            GROUP BY TipoFc
          `),
      db.request()
          .query(`
            WITH sg AS (
              SELECT DISTINCT sg.GrupoRegID, sg.SalesGroup, sg.Marca
              FROM BDISECC.mapping.SM_TRG_SgPe sg WITH (NOLOCK)
              WHERE 1=1 ${idWhereSG}
            )
            SELECT sg.GrupoRegID, DAY(v.Data) AS DayNum, SUM(v.NetSales) AS NetSales
            FROM BDISECC.dbo.SE_VFI_VendasporDiaMesAtual v WITH (NOLOCK)
            INNER HASH JOIN sg ON sg.SalesGroup = v.SalesGroupRevisado
                              AND v.MarcaVenda  = sg.Marca
            GROUP BY sg.GrupoRegID, DAY(v.Data)
            OPTION(RECOMPILE)
          `),
      (() => {
        const wYear  = parseInt(fechamento.substring(0, 4), 10);
        const wMonth = parseInt(fechamento.substring(4, 6), 10);
        return db.request()
          .input('wYear',  sql.Int, wYear)
          .input('wMonth', sql.Int, wMonth)
          .query(`
            SELECT CAST(Day AS INT) AS DayNum, WeekOfMonth
            FROM BDISECC.dbo.SE_TRO_WorkDaysBR WITH (NOLOCK)
            WHERE CAST(Year AS INT) = @wYear AND CAST(Month AS INT) = @wMonth
          `);
      })(),
    ]);

    // ── Agregação em JS ──────────────────────────────────────────────────────
    const forecastMap = {};
    forecastRawRes.recordset.forEach(r => {
      const id = r.GrupoRegID;
      if (!forecastMap[id]) {
        forecastMap[id] = {
          grupoRegID: id, nome: r.nome,
          forecast75Mes: 0, f75PorSemana:   [0, 0, 0, 0, 0],
          funilMes:      0, funilPorSemana: [0, 0, 0, 0, 0],
        };
      }
      const v0Raw = r.Valor0 != null ? Number(r.Valor0) : NaN;
      if (isNaN(v0Raw)) return;
      const vals = [r.Valor1, r.Valor2, r.Valor3, r.Valor4, r.Valor5].map(v => Number(v) || 0);
      const sum  = vals[0] + vals[1] + vals[2] + vals[3] + vals[4];
      if (v0Raw >= 0.74) {
        forecastMap[id].forecast75Mes += sum;
        vals.forEach((v, i) => { forecastMap[id].f75PorSemana[i] += v; });
      } else if (v0Raw >= 0.24 && v0Raw <= 0.55) {
        forecastMap[id].funilMes += sum;
        vals.forEach((v, i) => { forecastMap[id].funilPorSemana[i] += v; });
      }
    });

    const targetMap = {};
    targetRes.recordset.forEach(r => { targetMap[r.GrupoRegID] = Number(r.metaMes) || 0; });

    // Proporções semanais globais (metas semanais são gravadas por marca com GrupoRegID=0,
    // armazenadas como frações diretas — ex: 0.125, 0.2083 — iguais ao que target-semanas usa).
    // NÃO normalizamos pela soma para manter consistência com o fluxo individual.
    const globalWeekTargets = [0, 0, 0, 0, 0];
    targetWeekRes.recordset.forEach(r => {
      const idx = Number(String(r.TipoFc || '').replace(/[^1-5]/g, '')) - 1;
      if (idx >= 0 && idx < 5) globalWeekTargets[idx] = Number(r.Target) || 0;
    });
    const hasGlobalWeekTargets = globalWeekTargets.some(v => v > 0);
    const weekShares = hasGlobalWeekTargets ? globalWeekTargets : null;

    const weekMap = {};
    wdaysRes.recordset.forEach(r => { weekMap[r.DayNum] = r.WeekOfMonth; });

    const vendasMap = {};
    vendasRawRes.recordset.forEach(r => {
      if (!vendasMap[r.GrupoRegID]) vendasMap[r.GrupoRegID] = { total: 0, perWeek: [0, 0, 0, 0, 0] };
      const w  = weekMap[r.DayNum];
      const ns = Number(r.NetSales) || 0;
      vendasMap[r.GrupoRegID].total += ns;
      if (w >= 1 && w <= 5) vendasMap[r.GrupoRegID].perWeek[w - 1] += ns;
    });
    const result = Object.values(forecastMap).map(f => ({
      grupoRegID:      f.grupoRegID,
      nome:            f.nome,
      metaMes:         targetMap[f.grupoRegID]              || 0,
      vendasMes:       (vendasMap[f.grupoRegID] || {}).total || 0,
      vendasPorSemana: (vendasMap[f.grupoRegID] || {}).perWeek || [0, 0, 0, 0, 0],
      forecast75Mes:   f.forecast75Mes,
      f75PorSemana:    f.f75PorSemana,
      funilMes:        f.funilMes,
      funilPorSemana:  f.funilPorSemana,
      metaPorSemana: (() => {
        const meta = targetMap[f.grupoRegID] || 0;
        if (!weekShares || meta === 0) return [0, 0, 0, 0, 0];
        return weekShares.map(s => meta * s);
      })(),
    }));

    cache.set(cacheKey, result, RESUMO_CACHE_TTL);
    res.json(result);
  } catch (err) {
    console.error('[GET /api/forecast/resumo-assessores]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

module.exports = { getAll, getTarget, getTargetSemanas, uploadTarget, inserirDel, inserirAdd, uploadTargetFile, uploadForecastFile, resumoAssessores };
