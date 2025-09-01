const express = require('express');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Conexão com o MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB conectado...');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};
connectDB();

// Schemas do MongoDB
const UserSchema = new mongoose.Schema({
  login: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', UserSchema);

const DeviceSchema = new mongoose.Schema({
  macAddress: { type: String, required: true, unique: true },
  serialNumber: { type: String, required: true, unique: true },
  category: { type: String },
  wmsLogin: { type: String },
  status: { type: String, enum: ['ativo', 'inativo', 'disponível'], default: 'disponível' },
  assignedTo: { type: String },
  lastPing: { type: Date },
  currentWifi: { type: String },
  lastAssignedAt: { type: Date },
});
const Device = mongoose.model('Device', DeviceSchema);

// Middleware de Autenticação
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'Nenhum token, autorização negada' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token não é válido' });
  }
};

// Funções de atualização em tempo real
const broadcastUpdate = (wss, update) => {
  if (wss && wss.clients) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(update));
      }
    });
  }
};

// Configuração do servidor
app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
  req.wss = wss;
  next();
});

// ROTAS
app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body;
  try {
    let user = await User.findOne({ login });
    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);
      user = new User({ login: process.env.ADMIN_LOGIN, password: hashedPassword });
      await user.save();
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Credenciais inválidas' });
    }
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.get('/api/devices', auth, async (req, res) => {
  try {
    const devices = await Device.find();
    res.json(devices);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.get('/api/devices/stats', auth, async (req, res) => {
  try {
    const total = await Device.countDocuments();
    const active = await Device.countDocuments({ status: 'ativo' });
    const inactive = await Device.countDocuments({ status: 'inativo' });
    const available = await Device.countDocuments({ status: 'disponível' });
    res.json({ total, active, inactive, available });
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.post('/api/devices', auth, async (req, res) => {
  const { macAddress, serialNumber, category, wmsLogin } = req.body;
  try {
    const newDevice = new Device({ macAddress, serialNumber, category, wmsLogin, status: 'disponível' });
    const device = await newDevice.save();
    broadcastUpdate(req.wss, { type: 'device-added', device });
    res.status(201).json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.put('/api/devices/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { macAddress, serialNumber, category, wmsLogin } = req.body;
  try {
    const device = await Device.findByIdAndUpdate(id, { macAddress, serialNumber, category, wmsLogin }, { new: true });
    if (!device) return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    broadcastUpdate(req.wss, { type: 'device-updated', device });
    res.json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.put('/api/devices/:id/assign', auth, async (req, res) => {
  const { id } = req.params;
  const { assignedTo } = req.body;
  try {
    const device = await Device.findByIdAndUpdate(id, { assignedTo, status: 'ativo', lastAssignedAt: new Date() }, { new: true });
    if (!device) return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    broadcastUpdate(req.wss, { type: 'device-updated', device });
    res.json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.put('/api/devices/:id/unassign', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const device = await Device.findByIdAndUpdate(id, { assignedTo: null, status: 'disponível' }, { new: true });
    if (!device) return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    broadcastUpdate(req.wss, { type: 'device-updated', device });
    res.json(device);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.put('/api/devices/:id/set-inactive', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const updatedDevice = await Device.findByIdAndUpdate(id, { status: 'inativo', assignedTo: null }, { new: true });
    if (!updatedDevice) return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    broadcastUpdate(req.wss, { type: 'device-updated', device: updatedDevice });
    res.json(updatedDevice);
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.delete('/api/devices/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const device = await Device.findByIdAndDelete(id);
    if (!device) return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    broadcastUpdate(req.wss, { type: 'device-deleted', id });
    res.json({ msg: 'Dispositivo removido' });
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

app.post('/api/devices/:id/ping', auth, async (req, res) => {
  const { id } = req.params;
  const { currentWifi } = req.body;
  try {
    const device = await Device.findByIdAndUpdate(id, { lastPing: new Date(), currentWifi }, { new: true });
    if (!device) return res.status(404).json({ msg: 'Dispositivo não encontrado' });
    broadcastUpdate(req.wss, { type: 'device-ping', device });
    res.json({ msg: 'Ping recebido com sucesso', device });
  } catch (err) {
    res.status(500).send('Erro no servidor');
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));