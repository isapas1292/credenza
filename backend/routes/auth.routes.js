const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Protected routes
// Nota: Debería ir en user.routes.js pero por practicidad lo mantenemos aquí para la migración
router.put('/usuarios/:id/perfil', verifyToken, AuthController.updateProfile);

module.exports = router;
