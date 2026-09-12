const express = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);
router.put('/me', authMiddleware, authController.updateMe);
router.delete('/me', authMiddleware, authController.deleteMe);

module.exports = router;
