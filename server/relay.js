/**
 * Optional Standalone WebSocket Relay Server for Snake & Ladder
 * 
 * Run with: node server/relay.js
 * Default Port: 8080
 * 
 * Used for LAN tournaments or environments with strict symmetric NAT firewalls.
 */

import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const wss = new WebSocketServer({ port: PORT });

// roomCode -> Set of client sockets
const rooms = new Map();

console.log(`[Snake & Ladder] Relay server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'JOIN_ROOM') {
        const room = data.roomCode?.toUpperCase();
        if (!room) return;
        currentRoom = room;
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room).add(ws);
        console.log(`[Relay] Client joined room: ${room} (Total: ${rooms.get(room).size})`);
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
        console.log(`[Relay] Room ${currentRoom} empty and closed.`);
      }
    }
  });
});
