import { describe, it, expect, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { createRelayServer } from '../server/relay.js';

describe('Standalone Relay Server', () => {
  let serverInstance: ReturnType<typeof createRelayServer>;
  let port: number;

  const startServer = (): Promise<number> => {
    return new Promise((resolve) => {
      serverInstance = createRelayServer(0); // ephemeral port
      serverInstance.wss.on('listening', () => {
        const addr = serverInstance.wss.address();
        if (typeof addr === 'object' && addr !== null) {
          port = addr.port;
          resolve(port);
        }
      });
    });
  };

  afterAll(async () => {
    if (serverInstance?.wss) {
      await new Promise<void>((resolve) => {
        serverInstance.wss.close(() => resolve());
      });
    }
  });

  it('starts cleanly and assigns a listening port', async () => {
    const p = await startServer();
    expect(p).toBeGreaterThan(0);
  });

  it('relays packets between clients in the same room', async () => {
    const client1 = new WebSocket(`ws://127.0.0.1:${port}`);
    const client2 = new WebSocket(`ws://127.0.0.1:${port}`);

    await Promise.all([
      new Promise((res) => client1.on('open', res)),
      new Promise((res) => client2.on('open', res)),
    ]);

    // Join room
    client1.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: 'TEST01' }));
    client2.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: 'TEST01' }));

    // Small delay to register room
    await new Promise((res) => setTimeout(res, 50));
    expect(serverInstance.rooms.get('TEST01')?.size).toBe(2);

    // Send packet from client 1
    const receivedPacketPromise = new Promise<any>((resolve) => {
      client2.on('message', (msg) => {
        resolve(JSON.parse(msg.toString()));
      });
    });

    client1.send(JSON.stringify({ type: 'CHAT', text: 'Hello from client 1' }));

    const received = await receivedPacketPromise;
    expect(received.type).toBe('CHAT');
    expect(received.text).toBe('Hello from client 1');

    client1.close();
    client2.close();
  });

  it('handles room switching and cleans up empty rooms', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((res) => client.on('open', res));

    // Join Room 1
    client.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: 'ROOM_A' }));
    await new Promise((res) => setTimeout(res, 50));
    expect(serverInstance.rooms.get('ROOM_A')?.size).toBe(1);

    // Switch to Room 2
    client.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: 'ROOM_B' }));
    await new Promise((res) => setTimeout(res, 50));

    // ROOM_A should be empty and cleaned up
    expect(serverInstance.rooms.has('ROOM_A')).toBe(false);
    expect(serverInstance.rooms.get('ROOM_B')?.size).toBe(1);

    // Close client
    client.close();
    await new Promise((res) => setTimeout(res, 50));
    expect(serverInstance.rooms.has('ROOM_B')).toBe(false);
  });
});
