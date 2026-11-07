const router               = require('express').Router();
const assessoresController = require('../controllers/assessores.controller');

router.get('/buscarassessores', assessoresController.buscarAssessores);
router.get('/camadas-usuario',  assessoresController.camadasUsuario);
router.get('/marca-usuario',    assessoresController.marcaUsuario);

module.exports = router;
