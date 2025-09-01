const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  macAddress: {
    type: String,
    required: true,
    unique: true,
  },
  serialNumber: {
    type: String,
    required: true,
    unique: true,
  },
  category: {
    type: String,
    default: 'Sem Categoria',
  },
  wmsLogin: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['ativo', 'inativo', 'disponível'], // <-- Alterado
    default: 'disponível',
  },
  assignedTo: {
    type: String,
    default: null,
  },
  lastPing: {
    type: Date,
    default: null,
  },
  currentWifi: {
    type: String,
    default: null,
  },
  lastAssignedAt: {
    type: Date,
    default: null,
  },
});

module.exports = mongoose.model('Device', DeviceSchema);