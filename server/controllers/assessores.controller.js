const sql = require('mssql');

const { authDb }                          = require('../db/sqlite');
const { getPool }                         = require('../db/mssql');
const { FechamentoNow }                   = require('../utils/date');
const { getUserAssessorIDs } = require('../utils/forecastTable');

// ── GET /api/buscarassessores ────────────────────────────────────────────────
async function buscarAssessores(req, res) {
  try {
    const db         = await getPool();
    const fechamento = FechamentoNow();
    const email      = req.user && req.user.email;

    let userRole = null;
    try {
      const u = authDb.prepare('SELECT role FROM users WHERE email = ?').get(email);
      userRole = u && u.role ? u.role : null;
    } catch {}

    console.log(`[buscarassessores] email="${email}" role="${userRole}" fechamento="${fechamento}"`);

    let query;
    const request = db.request().input('fechamento', sql.NVarChar(6), fechamento);

    if (userRole === 'admin') {
      query = `
        SELECT DISTINCT CONCAT(B.NomeSistema, ' #', A.GrupoRegID) AS NomeSistemaGrupoRegID
        FROM BDISECC.sandbox.SS_TFI_NDBR_Forecast A
        JOIN BDISECC.mapping.SM_TRG_GrPe B ON A.GrupoRegID = B.GrupoRegID
        WHERE A.Fechamento = @fechamento
        UNION
        SELECT DISTINCT CONCAT(B.NomeSistema, ' #', A.GrupoRegID) AS NomeSistemaGrupoRegID
        FROM BDISECC.sandbox.SS_TFI_STBR_Forecast A
        JOIN BDISECC.mapping.SM_TRG_GrPe B ON A.GrupoRegID = B.GrupoRegID
        WHERE A.Fechamento = @fechamento
      `;
    } else {
      const { filtroGrupoRegID, filtroGrupoRegIDs } = await getUserAssessorIDs(email, db);
      console.log(`[buscarassessores] forecastTables="SS_TFI_NDBR_Forecast,SS_TFI_STBR_Forecast" filtroGrupoRegID=${filtroGrupoRegID} filtroGrupoRegIDs=${JSON.stringify(filtroGrupoRegIDs)}`);

      query = `
        SELECT DISTINCT CONCAT(B.NomeSistema, ' #', A.GrupoRegID) AS NomeSistemaGrupoRegID
        FROM (
          SELECT GrupoRegID, Fechamento FROM BDISECC.sandbox.SS_TFI_NDBR_Forecast
          UNION ALL
          SELECT GrupoRegID, Fechamento FROM BDISECC.sandbox.SS_TFI_STBR_Forecast
        ) A
        JOIN BDISECC.mapping.SM_TRG_GrPe B ON A.GrupoRegID = B.GrupoRegID
        WHERE A.Fechamento = @fechamento
      `;
      if (filtroGrupoRegID) {
        query += ' AND A.GrupoRegID = @grupoRegID';
        request.input('grupoRegID', sql.Int, filtroGrupoRegID);
      } else if (filtroGrupoRegIDs) {
        query += ` AND A.GrupoRegID IN (${filtroGrupoRegIDs.map(id => Number(id)).join(',')})`;
      }
    }

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[GET /api/buscarassessores]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── GET /api/camadas-usuario ─────────────────────────────────────────────────
async function camadasUsuario(req, res) {
  try {
    const email = req.user && req.user.email;
    if (!email) return res.status(401).json({ error: 'unauthorized' });

    const db = await getPool();

    let userRole = null;
    try {
      const userSqlite = authDb.prepare('SELECT role FROM users WHERE email = ?').get(email);
      userRole = userSqlite && userSqlite.role ? userSqlite.role : null;
    } catch {}

    if (userRole === 'admin') {
      return res.json([{ categoria: null, role: 'admin' }]);
    }

    const pessoaRes = await db.request()
      .input('Email', sql.NVarChar(255), email)
      .query(`SELECT TOP 1 * FROM BDISECC.mapping.SM_TDG_Pessoas WHERE Email = @Email`);

    const pessoa = pessoaRes.recordset && pessoaRes.recordset[0];
    if (!pessoa || !pessoa.Unumber) {
      return res.json(userRole ? [{ categoria: null, role: userRole }] : []);
    }
    const unumber = pessoa.Unumber;

    const result = await db.request()
      .input('Unumber', sql.NVarChar(255), unumber)
      .query(`
        SELECT SalesRepGrupoRegID, SalesRepUnumber, CoordUnumber, GerenteUnumber
        FROM BDISECC.mapping.SM_TRG_Mapping
        WHERE SalesRepUnumber = @Unumber OR CoordUnumber = @Unumber OR GerenteUnumber = @Unumber
      `);

    const mapped = result.recordset.map(row => {
      let categoria = null;
      if      (row.SalesRepUnumber === unumber) categoria = 'SalesRep';
      else if (row.CoordUnumber    === unumber) categoria = 'Coord';
      else if (row.GerenteUnumber  === unumber) categoria = 'Gerente';
      return { ...row, categoria, role: userRole };
    });

    if (mapped.length === 0 && userRole) {
      mapped.push({ categoria: null, role: userRole });
    }

    res.json(mapped);
  } catch (err) {
    console.error('[GET /api/camadas-usuario]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

// ── GET /api/marca-usuario ───────────────────────────────────────────────────
async function marcaUsuario(req, res) {
  try {
    const email = req.user && req.user.email;
    if (!email) return res.status(401).json({ error: 'unauthorized' });

    const db = await getPool();

    const pessoaRes = await db.request()
      .input('Email', sql.NVarChar(255), email)
      .query(`SELECT TOP 1 Unumber, NomeSistema FROM BDISECC.mapping.SM_TDG_Pessoas WHERE Email = @Email`);
    const pessoa = pessoaRes.recordset && pessoaRes.recordset[0];
    if (!pessoa || !pessoa.NomeSistema) {
      return res.status(404).json({ error: 'not_found', message: 'Usuário não encontrado na base de pessoas' });
    }

    const sgpeRes = await db.request()
      .input('NomeSistema', sql.NVarChar(255), pessoa.NomeSistema)
      .query(`SELECT x.Marca FROM BDISECC.mapping.SM_TRG_SgPe x WHERE NomeSistema = @NomeSistema`);
    const marca = sgpeRes.recordset && sgpeRes.recordset[0] ? sgpeRes.recordset[0].Marca : null;
    res.json({ Marca: marca });
  } catch (err) {
    console.error('[GET /api/marca-usuario]', err.message);
    res.status(500).json({ error: 'db_error' });
  }
}

module.exports = { buscarAssessores, camadasUsuario, marcaUsuario };
