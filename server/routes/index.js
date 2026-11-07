const router        = require('express').Router();
const { requireAuth } = require('../middleware/requireAuth');

// Rotas públicas (sem autenticação)
router.use('/api', require('./auth.routes'));

// Rotas protegidas (exigem cookie JWT válido)
router.use('/api', requireAuth, require('./forecast.routes'));
router.use('/api', requireAuth, require('./assessores.routes'));
router.use('/api', requireAuth, require('./vendas.routes'));

module.exports = router;
