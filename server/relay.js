/**
 * Optional Standalone WebSocket Relay Server for Snake & Ladder
 * 
 * Run with: node server/relay.js
 * Default Port: 8080
 * 
 * Used for LAN tournaments or environments with strict symmetric NAT firewalls.
 */

import { WebSocketServer } from 'ws';

export function createRelayServer(port = 8080) {
  const wss = new WebSocketServer({ port });
  // roomCode -> Set of client sockets
  const rooms = new Map();

  wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'JOIN_ROOM') {
          const room = data.roomCode?.toUpperCase();
          if (!room) return;

          // Room switching: remove socket from old room before joining new room
          if (currentRoom && currentRoom !== room && rooms.has(currentRoom)) {
            const prevRoomSockets = rooms.get(currentRoom);
            prevRoomSockets.delete(ws);
            if (prevRoomSockets.size === 0) {
              rooms.delete(currentRoom);
            }
          }

          currentRoom = room;
          if (!rooms.has(room)) rooms.set(room, new Set());
          rooms.get(room).add(ws);
          return;
        }

        if (currentRoom && rooms.has(currentRoom)) {
          // Broadcast packet to all other clients in the room
          const roomSockets = rooms.get(currentRoom);
          roomSockets.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              client.send(message.toString());
            }
          });
        }
      } catch (err) {
        console.error('[Relay] Error handling message:', err);
      }
    });

    ws.on('close', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const roomSockets = rooms.get(currentRoom);
        roomSockets.delete(ws);
        if (roomSockets.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });

  return { wss, rooms };
}

// Start immediately when executed directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('relay.js') || process.argv[1].endsWith('relay')
);

if (isDirectRun) {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  createRelayServer(PORT);
  console.log(`[Snake & Ladder] Relay server running on ws://localhost:${PORT}`);
}
