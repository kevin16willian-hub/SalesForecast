const router           = require('express').Router();
const vendasController = require('../controllers/vendas.controller');

router.get('/workdays',              vendasController.workdays);
router.get('/vendas-mes-atual',      vendasController.vendasMesAtual);
router.get('/clientes-microregiao',  vendasController.clientesMicroregiao);

module.exports = router;
