#!/usr/bin/env node

const { io } = require('socket.io-client');

const CHAT_URL = process.env.CHAT_URL || 'http://localhost:3006';
const JWT = process.env.JWT;
const PROJECT_ID = process.env.PROJECT_ID;
const MESSAGE = process.env.MESSAGE || `Hello chat ${new Date().toISOString()}`;

if (!JWT || !PROJECT_ID) {
  console.error('Usage: JWT=<token> PROJECT_ID=<uuid> node scripts/test-chat-ws.js');
  process.exit(1);
}

const socket = io(CHAT_URL, {
  auth: { token: JWT },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('joinProject', { projectId: PROJECT_ID }, (ack) => {
    console.log('joinProject ack', ack);
    if (ack?.ok === false) {
      socket.close();
      process.exit(1);
    }
    socket.emit('sendMessage', { projectId: PROJECT_ID, message: MESSAGE }, (sent) => {
      console.log('sendMessage ack', sent);
    });
  });
});

socket.on('joinedProject', (data) => console.log('joinedProject', data));
socket.on('newMessage', (data) => {
  console.log('newMessage (broadcast)', data);
  setTimeout(() => {
    socket.close();
    process.exit(0);
  }, 300);
});
socket.on('error', (error) => console.error('socket error event', error));
socket.on('connect_error', (error) => {
  console.error('connect_error', error.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('timeout waiting for newMessage');
  socket.close();
  process.exit(1);
}, 15000);
