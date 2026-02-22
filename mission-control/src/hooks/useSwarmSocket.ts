import { useState, useEffect, useCallback } from 'react';

export interface SwarmMetrics {
  cpuLoad: number;
  uptime: number;
  freemem: number;
  totalmem: number;
  krillEaten: number;
}

export interface SwarmAgent {
  id: string;
  name: string;
  type: string;
  status: string;
  load: number;
  task: string;
}

export interface AbyssReport {
  generatedAt: string;
  healthScore: number;
  activeAgents: number;
  staleAgents: number;
  totalAgents: number;
  subagents: number;
  cronAgents: number;
  coreAgents: number;
  avgLoad: number;
  tokenInput: number;
  tokenOutput: number;
  tokenTotal: number;
  tokenDelta: number;
  modelMix: Record<string, number>;
  alerts: string[];
}

export function useSwarmSocket() {
  const [connected, setConnected] = useState(false);
  const [metrics, setMetrics] = useState<SwarmMetrics | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [agents, setAgents] = useState<SwarmAgent[]>([]);
  const [abyssReport, setAbyssReport] = useState<AbyssReport | null>(null);
  const [lastMessage, setLastMessage] = useState<any>(null);

  const connect = useCallback(() => {
    const host = window.location.hostname;
    const ws = new WebSocket(`ws://${host}:3001`);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);

        switch (data.type) {
          case 'os_metrics':
            setMetrics(data.payload);
            break;
          case 'new_log':
            setLogs(prev => {
              const newLogs = [...prev, data.payload];
              return newLogs.length > 1000 ? newLogs.slice(newLogs.length - 1000) : newLogs;
            });
            break;
          case 'agents_update':
            setAgents(data.payload);
            break;
          case 'abyss_report':
            setAbyssReport(data.payload || null);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('Failed to parse websocket message', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 5000);
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return { connected, metrics, logs, agents, abyssReport, lastMessage };
}
