const express = require('express');
const usersController = require('../controllers/users.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/uid', authMiddleware, usersController.getUid);
router.post('/uid', authMiddleware, usersController.setUid);

module.exports = router;
