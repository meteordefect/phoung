import { Router, Request, Response } from 'express';

const router = Router();

type SSEClient = {
  id: string;
  res: Response;
};

const clients: SSEClient[] = [];
let clientIdCounter = 0;

export function broadcastSSE(event: string, data: Record<string, unknown>) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.res.write(payload);
  }
}

router.get('/events/stream', (req: Request, res: Response) => {
  const clientId = `sse-${++clientIdCounter}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  const client: SSEClient = { id: clientId, res };
  clients.push(client);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

export default router;
