import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import os from 'os';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DATA_PATH = path.join(__dirname, 'data.json');
const LOG_PATH = path.join(os.homedir(), '.openclaw', 'logs', 'gateway.log');

app.use(cors());
app.use(express.json());

const readData = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    return { tasks: [], objectives: [], logs: [] };
  }
};
const writeData = (data) => fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

// GET everything (legacy fallback)
app.get('/api/data', (req, res) => res.json(readData()));

// Task Endpoints
app.post('/api/tasks', (req, res) => {
  const data = readData();
  const newTask = { ...req.body, id: `t-${Date.now()}` };
  data.tasks.push(newTask);
  writeData(data);
  res.json(newTask);
});

app.patch('/api/tasks/:id', (req, res) => {
  const data = readData();
  const index = data.tasks.findIndex(t => t.id === req.params.id);
  if (index > -1) {
    data.tasks[index] = { ...data.tasks[index], ...req.body };
    writeData(data);
    res.json(data.tasks[index]);
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  const data = readData();
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});

// Objective Endpoints
app.patch('/api/objectives/:id', (req, res) => {
  const data = readData();
  const index = data.objectives.findIndex(o => o.id === req.params.id);
  if (index > -1) {
    data.objectives[index] = { ...data.objectives[index], ...req.body };
    writeData(data);
    res.json(data.objectives[index]);
  } else {
    res.status(404).json({ error: 'Objective not found' });
  }
});

// State to track agents memory
let activeAgents = readData().agents || [];

const saveAgents = () => {
  const data = readData();
  data.agents = activeAgents;
  writeData(data);
};

// WEBHOOK RECEIVER for Openclaw
app.post('/api/webhook', (req, res) => {
  const event = req.body;
  if (event && event.type === 'agent.status_changed') {
    // A very simple heuristic to update agent state in memory
    const index = activeAgents.findIndex(a => a.id === event.payload.agentId);
    if (index > -1) {
      activeAgents[index] = { ...activeAgents[index], ...event.payload };
    } else {
      activeAgents.push({
        id: event.payload.agentId,
        name: event.payload.agentName || 'Unknown Agent',
        type: event.payload.agentType || 'subagent',
        status: event.payload.status || 'active',
        load: Math.floor(Math.random() * 40) + 10,
        task: event.payload.task || 'IDLE'
      });
    }
    broadcast({ type: 'agents_update', payload: activeAgents });
    saveAgents();
  }

  // Custom parsing for task/agent creation and updates
  if (event && event.type === 'engine.telemetry') {
    broadcast({ type: 'telemetry_update', payload: event.payload });
  }

  res.json({ success: true, received: true });
});

// START HTTP SERVER
const server = app.listen(PORT, () => console.log(`Swarm Backend online: http://localhost:${PORT}`));

// WEBSOCKET SERVER
const wss = new WebSocketServer({ server });

const broadcast = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(data));
    }
  });
};

wss.on('connection', (ws) => {
  console.log('Frontend dashboard connected to Neural Link');
  ws.send(JSON.stringify({ type: 'neural_link_connected', payload: { status: 'STABLE' } }));
  ws.send(JSON.stringify({ type: 'agents_update', payload: activeAgents }));
  const data = readData();
  ws.send(JSON.stringify({ type: 'abyss_report', payload: data.abyssReport || null }));
});

// 1. TAIL GATEWAY.LOG
if (fs.existsSync(LOG_PATH)) {
  console.log(`Tailing logs at ${LOG_PATH}`);
  const tailProcess = exec(`tail -f "${LOG_PATH}"`);

  tailProcess.stdout.on('data', (data) => {
    const lines = data.split('\n').filter(l => l.trim().length > 0);
    lines.forEach(line => {
      broadcast({ type: 'new_log', payload: line });
    });
  });

  tailProcess.stderr.on('data', (err) => console.error(`Tail error: ${err}`));
} else {
  console.log(`Log file not found at ${LOG_PATH}`);
}

// 2. BROADCAST OS METRICS EVERY 2 SECONDS
setInterval(() => {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;

  cpus.forEach(cpu => {
    for (let type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);

  const data = readData();
  const krill = data.stats?.krillEaten || 0;

  broadcast({
    type: 'os_metrics',
    payload: {
      cpuLoad: usage,
      uptime: os.uptime(),
      freemem: os.freemem(),
      totalmem: os.totalmem(),
      krillEaten: krill + Math.floor(Math.random() * 50) // Simulate real-time eating
    }
  });
}, 2000);

// 3. BROADCAST ABYSS REPORT SNAPSHOT EVERY 10 SECONDS
setInterval(() => {
  const data = readData();
  if (data?.abyssReport) {
    broadcast({ type: 'abyss_report', payload: data.abyssReport });
  }
}, 10000);

