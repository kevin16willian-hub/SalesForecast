const { sql, getPool } = require('../db/mssql');
const { authDb }       = require('../db/sqlite');
const cache            = require('./cache');

// Retorna a tabela de forecast conforme o GrupoRegID do assessor selecionado.
// Resultado é cacheado permanentemente — a Marca de um GrupoRegID não muda em produção.
async function getForecastTableByGrupoRegID(grupoRegID, db) {
  if (!grupoRegID || !Number.isFinite(Number(grupoRegID))) return 'SS_TFI_NDBR_Forecast';
  const cacheKey = `forecastTable:grp:${grupoRegID}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const res = await db.request()
    .input('GrupoRegID', sql.Int, Number(grupoRegID))
    .query(`SELECT TOP 1 Marca FROM BDISECC.mapping.SM_TRG_SgPe WITH (NOLOCK) WHERE GrupoRegID = @GrupoRegID`);
  const marca = res.recordset && res.recordset[0] ? res.recordset[0].Marca : null;
  const table = (marca && marca.toLowerCase() === 'straumann') ? 'SS_TFI_STBR_Forecast' : 'SS_TFI_NDBR_Forecast';

  cache.set(cacheKey, table, 12 * 60 * 60 * 1000); // 12h
  return table;
}

// Retorna o código de marca gravado no forecast conforme o GrupoRegID do assessor selecionado.
// O valor vem do grupo, não do usuário logado.
async function getForecastBrandCodeByGrupoRegID(grupoRegID, db) {
  if (!grupoRegID || !Number.isFinite(Number(grupoRegID))) return 'NEO';
  const cacheKey = `forecastBrand:grp:${grupoRegID}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const res = await db.request()
    .input('GrupoRegID', sql.Int, Number(grupoRegID))
    .query(`SELECT TOP 1 Marca FROM BDISECC.mapping.SM_TRG_SgPe WITH (NOLOCK) WHERE GrupoRegID = @GrupoRegID`);
  const marca = res.recordset && res.recordset[0] ? String(res.recordset[0].Marca || '') : '';
  const marcaLower = marca.trim().toLowerCase();
  const brandCode = (marcaLower === 'straumann' || marcaLower === 'str') ? 'STR' : 'NEO';

  cache.set(cacheKey, brandCode, 12 * 60 * 60 * 1000); // 12h
  return brandCode;
}

// Retorna o código de marca do usuário logado.
async function getForecastBrandCodeByEmail(email, db) {
  if (!email) return 'NEO';
  const cacheKey = `forecastBrand:email:${String(email).toLowerCase()}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const pessoaRes = await db.request()
    .input('Email', sql.NVarChar(255), email)
    .query(`SELECT TOP 1 NomeSistema FROM BDISECC.mapping.SM_TDG_Pessoas WHERE Email = @Email`);

  const pessoa = pessoaRes.recordset && pessoaRes.recordset[0];
  if (!pessoa || !pessoa.NomeSistema) {
    cache.set(cacheKey, 'NEO', 12 * 60 * 60 * 1000);
    return 'NEO';
  }

  const sgpeRes = await db.request()
    .input('NomeSistema', sql.NVarChar(255), pessoa.NomeSistema)
    .query(`SELECT TOP 1 x.Marca FROM BDISECC.mapping.SM_TRG_SgPe x WHERE NomeSistema = @NomeSistema`);

  const marca = sgpeRes.recordset && sgpeRes.recordset[0] ? String(sgpeRes.recordset[0].Marca || '') : '';
  const marcaLower = marca.trim().toLowerCase();
  const brandCode = (marcaLower === 'straumann' || marcaLower === 'str') ? 'STR' : 'NEO';

  cache.set(cacheKey, brandCode, 12 * 60 * 60 * 1000);
  return brandCode;
}

// Retorna a tabela de forecast conforme a marca do usuário logado (sem GrupoRegID de assessor).
async function getForecastTableName(email, db) {
  const pessoaRes = await db.request()
    .input('Email', sql.NVarChar(255), email)
    .query(`SELECT TOP 1 NomeSistema FROM BDISECC.mapping.SM_TDG_Pessoas WHERE Email = @Email`);

  const pessoa = pessoaRes.recordset && pessoaRes.recordset[0];
  if (!pessoa || !pessoa.NomeSistema) return 'SS_TFI_NDBR_Forecast';

  const sgpeRes = await db.request()
    .input('NomeSistema', sql.NVarChar(255), pessoa.NomeSistema)
    .query(`SELECT x.Marca FROM BDISECC.mapping.SM_TRG_SgPe x WHERE NomeSistema = @NomeSistema`);

  const marca = sgpeRes.recordset && sgpeRes.recordset[0] ? sgpeRes.recordset[0].Marca : null;
  if (marca && marca.toLowerCase() === 'straumann') return 'SS_TFI_STBR_Forecast';
  return 'SS_TFI_NDBR_Forecast';
}

// TTL do cache para IDs de assessor por usuário (10 minutos)
const ASSESSOR_IDS_CACHE_TTL = 10 * 60 * 1000;

// Retorna os IDs de assessor filtráveis conforme a camada do usuário logado.
async function getUserAssessorIDs(email, db) {
  const cacheKey = `assessorIDs:${email}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const pessoaRes = await db.request()
    .input('Email', sql.NVarChar(255), email)
    .query(`SELECT TOP 1 * FROM BDISECC.mapping.SM_TDG_Pessoas WHERE Email = @Email`);
  const pessoa = pessoaRes.recordset && pessoaRes.recordset[0];
  if (!pessoa || !pessoa.Unumber) {
    const empty = { filtroGrupoRegID: null, filtroGrupoRegIDs: null };
    cache.set(cacheKey, empty, ASSESSOR_IDS_CACHE_TTL);
    return empty;
  }

  const unumber = pessoa.Unumber;
  let userRole = null;
  try {
    const userSqlite = authDb.prepare('SELECT role FROM users WHERE email = ?').get(email);
    userRole = userSqlite && userSqlite.role ? userSqlite.role : null;
  } catch {}

  const camadaRes = await db.request()
    .input('Unumber', sql.NVarChar(255), unumber)
    .query(`
      SELECT SalesRepGrupoRegID, SalesRepUnumber, CoordUnumber, GerenteUnumber
      FROM BDISECC.mapping.SM_TRG_Mapping
      WHERE SalesRepUnumber = @Unumber OR CoordUnumber = @Unumber OR GerenteUnumber = @Unumber
    `);
  const camadas = camadaRes.recordset || [];
  const camada  = camadas[0];
  let categoria = null;
  if (camada) {
    if      (camada.SalesRepUnumber === unumber) categoria = 'SalesRep';
    else if (camada.CoordUnumber    === unumber) categoria = 'Coord';
    else if (camada.GerenteUnumber  === unumber) categoria = 'Gerente';
  }

  let result;
  if (userRole === 'user' && categoria === 'SalesRep') {
    result = { filtroGrupoRegID: camada.SalesRepGrupoRegID, filtroGrupoRegIDs: null };
  } else if (userRole === 'user' && (categoria === 'Coord' || categoria === 'Gerente')) {
    const filterField = categoria === 'Coord' ? 'CoordUnumber' : 'GerenteUnumber';
    const ids = [...new Set(
      camadas
        .filter(r => r[filterField] === unumber)
        .map(r => r.SalesRepGrupoRegID)
        .filter(id => id != null)
    )];
    result = { filtroGrupoRegID: null, filtroGrupoRegIDs: ids.length > 0 ? ids : null };
  } else {
    result = { filtroGrupoRegID: null, filtroGrupoRegIDs: null };
  }

  cache.set(cacheKey, result, ASSESSOR_IDS_CACHE_TTL);
  return result;
}

// Verifica se o email do usuário logado tem acesso ao grupoRegID solicitado.
// Reutiliza o cache de getUserAssessorIDs — sem consulta adicional ao banco.
async function canAccessGrupoRegID(email, grupoRegID, db) {
  const { filtroGrupoRegID, filtroGrupoRegIDs } = await getUserAssessorIDs(email, db);
  // Admin ou sem restrição: acesso irrestrito
  if (filtroGrupoRegID == null && filtroGrupoRegIDs == null) return true;
  // SalesRep: acesso somente ao próprio ID
  if (filtroGrupoRegID != null && Number(filtroGrupoRegID) === Number(grupoRegID)) return true;
  // Coord / Gerente: acesso à lista de subordinados
  if (Array.isArray(filtroGrupoRegIDs) && filtroGrupoRegIDs.map(Number).includes(Number(grupoRegID))) return true;
  return false;
}

module.exports = { getForecastTableByGrupoRegID, getForecastBrandCodeByGrupoRegID, getForecastBrandCodeByEmail, getForecastTableName, getUserAssessorIDs, canAccessGrupoRegID };
