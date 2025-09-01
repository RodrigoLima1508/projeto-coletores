const Device = require('../models/Device');
const WebSocket = require('ws');

// Função para enviar uma atualização para todos os clientes WebSocket
const broadcastUpdate = (wss, update) => {
  if (wss && wss.clients) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(update));
      }
    });
  }
};

exports.getAllDevices = async (req, res) => {
  try {
    const { status, search } = req.query; // <-- Adicionado
    let filter = {};

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { macAddress: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const devices = await Device.find(filter); // <-- Adicionado
    res.json(devices);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.getDeviceStats = async (req, res) => {
  try {
    const total = await Device.countDocuments();
    const active = await Device.countDocuments({ status: 'ativo' });
    const inactive = await Device.countDocuments({ status: 'inativo' });
    const available = await Device.countDocuments({ status: 'disponível' });

    res.json({ total, active, inactive, available });
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.addDevice = async (req, res) => {
  const { macAddress, serialNumber, category, wmsLogin } = req.body;
  try {
    const newDevice = new Device({
      macAddress,
      serialNumber,
      category,
      wmsLogin,
      status: 'disponível',
    });
    const device = await newDevice.save();
    broadcastUpdate(req.wss, { type: 'device-added', device });
    res.status(201).json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.updateDevice = async (req, res) => {
  const { id } = req.params;
  const { macAddress, serialNumber, category, wmsLogin } = req.body;
  try {
    const device = await Device.findByIdAndUpdate(
      id,
      { macAddress, serialNumber, category, wmsLogin },
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    }
    broadcastUpdate(req.wss, { type: 'device-updated', device });
    res.json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.assignDevice = async (req, res) => {
  const { id } = req.params;
  const { assignedTo } = req.body;
  try {
    const device = await Device.findByIdAndUpdate(
      id,
      {
        assignedTo,
        status: 'ativo',
        lastAssignedAt: new Date(),
      },
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    }
    broadcastUpdate(req.wss, { type: 'device-updated', device });
    res.json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.unassignDevice = async (req, res) => {
  const { id } = req.params;
  try {
    const device = await Device.findByIdAndUpdate(
      id,
      {
        assignedTo: null,
        status: 'disponível',
      },
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    }
    broadcastUpdate(req.wss, { type: 'device-updated', device });
    res.json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.setInactive = async (req, res) => {
  const { id } = req.params;
  try {
    const device = await Device.findById(id);
    if (!device) {
      return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    }

    const updatedDevice = await Device.findByIdAndUpdate(
      id,
      { status: 'inativo', assignedTo: null },
      { new: true }
    );
    
    broadcastUpdate(req.wss, { type: 'device-updated', device: updatedDevice });
    res.json(updatedDevice);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.deleteDevice = async (req, res) => {
  const { id } = req.params;
  try {
    const device = await Device.findByIdAndDelete(id);
    if (!device) {
      return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    }
    broadcastUpdate(req.wss, { type: 'device-deleted', id });
    res.json({ msg: 'Dispositivo removido' });
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};

exports.pingDevice = async (req, res) => {
  const { id } = req.params;
  const { currentWifi } = req.body;
  try {
    const device = await Device.findByIdAndUpdate(
      id,
      {
        lastPing: new Date(),
        currentWifi: currentWifi,
      },
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    }
    broadcastUpdate(req.wss, { type: 'device-ping', device });
    res.json({ msg: 'Ping recebido com sucesso', device });
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
};