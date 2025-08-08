const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Adjust to specific frontend origin in production
  },
});
// Health check endpoint for Render
app.get('/', (req, res) => {
  res.send('Socket.IO server is running');
});

// Store online users and active chat status
const onlineUsers = new Map(); // userId -> socket.id
const activeChats = new Map(); // userId -> true/false

// Utility: Normalize room name (so 1-2 and 2-1 are same)
const getRoomName = (id1, id2) => [id1, id2].sort().join('-');

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Join chat or global room
  socket.on('join', ({ senderId, receiverId, senderName }) => {
    socket.data.userId = senderId; // save userId on socket
    socket.data.senderName = senderName; // save senderName on socket

    const room = receiverId ? getRoomName(senderId, receiverId) : `${senderId}-global`;
    socket.join(room);
    console.log(`✅ User ${senderId} joined room ${room}`);

    // Track online status
    onlineUsers.set(senderId, socket.id);
    io.emit('online-status-update', { userId: senderId, status: 'online' });

    // Mark chat active if a user has opened specific chat
    if (receiverId) {
      activeChats.set(senderId, true);
    }
  });

  // Handle chat inactivity (when user closes chat window)
  socket.on('chat-inactive', ({ userId }) => {
    activeChats.set(userId, false);
    console.log(`❌ User ${userId} marked as inactive`);
  });

  // Handle chat messages
  socket.on('chat-message', (msg) => {
    const { senderId, receiverId } = msg;

    // Emit message to both sender and receiver's room
    const room = getRoomName(senderId, receiverId);
    io.to(room).emit('chat-message', msg);

    // Send global notification only if receiver is online and not active in chat
    const receiverSocketId = onlineUsers.get(receiverId);
    const isReceiverActive = activeChats.get(receiverId) || false;

    if (receiverSocketId && !isReceiverActive) {
      io.to(receiverSocketId).emit('global-notification', {
        senderId,
        senderName: socket.data.senderName || 'Unknown',
        receiverId,
        message: msg.chatMessage,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      });

      console.log(`🔔 Global notification sent to ${receiverId} from ${senderId}`);
    }
  });

  // Handle typing indication
  socket.on('typing', ({ senderId, receiverId }) => {
    const room = getRoomName(senderId, receiverId);
    socket.to(room).emit('typing', { senderId });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (userId) {
      onlineUsers.delete(userId);
      activeChats.delete(userId);
      io.emit('online-status-update', { userId, status: 'offline' });
      console.log(`❌ User disconnected: ${userId} (${socket.id})`);
    } else {
      console.log(`❌ Unknown user disconnected: ${socket.id}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Socket server running at http://192.168.0.56:${PORT}`);

});
