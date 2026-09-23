const express = require('express');
const profileController = require('../controllers/profile.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', authMiddleware, profileController.getProfile);
router.post('/refresh', authMiddleware, profileController.refreshProfile);

module.exports = router;
