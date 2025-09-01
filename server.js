const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/auth');
const deviceRoutes = require('./src/routes/devices');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Conecta ao MongoDB
connectDB();

app.use(express.json());
app.use(cors());

// Configuração do servidor WebSocket
app.use((req, res, next) => {
  req.wss = wss;
  next();
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));