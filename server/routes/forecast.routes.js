const router             = require('express').Router();
const multer             = require('multer');
const forecastController = require('../controllers/forecast.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/forecast/all',                                          forecastController.getAll);
router.get('/forecast/target',                                       forecastController.getTarget);
router.get('/forecast/target-semanas',                               forecastController.getTargetSemanas);
router.get('/forecast/resumo-assessores',                            forecastController.resumoAssessores);
router.post('/forecast/target/upload',                               forecastController.uploadTarget);
router.post('/forecast/target/upload-file', upload.single('file'),  forecastController.uploadTargetFile);
router.post('/forecast/upload-file',        upload.single('file'),  forecastController.uploadForecastFile);
router.post('/forecast/inserir-del',                                 forecastController.inserirDel);
router.post('/forecast/inserir-add',                                 forecastController.inserirAdd);

module.exports = router;
