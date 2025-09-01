const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const deviceController = require('../controllers/deviceController');

router.get('/', auth, deviceController.getAllDevices);
router.get('/stats', auth, deviceController.getDeviceStats); // <-- Adicionado
router.post('/', auth, deviceController.addDevice);
router.put('/:id', auth, deviceController.updateDevice);
router.put('/:id/assign', auth, deviceController.assignDevice);
router.put('/:id/unassign', auth, deviceController.unassignDevice);
router.put('/:id/set-inactive', auth, deviceController.setInactive); // <-- Adicionado
router.delete('/:id', auth, deviceController.deleteDevice);
router.post('/:id/ping', auth, deviceController.pingDevice);

module.exports = router;