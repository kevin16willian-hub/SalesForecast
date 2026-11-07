const router         = require('express').Router();
const authController = require('../controllers/auth.microsoft.controller');

router.get('/auth/login/microsoft',    authController.loginMicrosoft);
router.get('/auth/callback/microsoft', authController.callbackMicrosoft);
router.get('/auth/logout',             authController.logout);
router.post('/auth/logout',            authController.logout);
router.post('/logout',                 authController.logout);
router.get('/me',                      authController.me);

module.exports = router;
