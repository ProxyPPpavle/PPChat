import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e7, // 10MB limit for file transfers
  cors: {
    origin: "*",
  },
});

const PORT = 3000;

// In-memory store
// rooms: { [roomName: string]: { messages: Message[] } }
interface Message {
  id: string;
  sender: string | null;
  text?: string;
  file?: {
    name: string;
    type: string;
    data: string; // base64
  };
  timestamp: number;
}

const rooms: Record<string, { messages: Message[] }> = {};

// Cleanup logic: Remove messages older than 10 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
const MESSAGE_TTL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach((roomName) => {
    rooms[roomName].messages = rooms[roomName].messages.filter(
      (msg) => now - msg.timestamp < MESSAGE_TTL
    );
    // If room is empty and has been for a while, we could delete it, 
    // but for now let's just keep it simple.
    if (rooms[roomName].messages.length === 0) {
      // delete rooms[roomName]; // Optional: aggressive cleanup
    }
  });
}, CLEANUP_INTERVAL);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomName: string) => {
    socket.join(roomName);
    if (!rooms[roomName]) {
      rooms[roomName] = { messages: [] };
    }
    // Send existing messages to the user who just joined
    socket.emit("room-history", rooms[roomName].messages);
    console.log(`User ${socket.id} joined room: ${roomName}`);
  });

  socket.on("leave-room", (roomName: string) => {
    socket.leave(roomName);
    console.log(`User ${socket.id} left room: ${roomName}`);
  });

  socket.on("send-message", ({ roomName, message }: { roomName: string; message: Omit<Message, "id" | "timestamp"> }) => {
    const fullMessage: Message = {
      ...message,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };

    if (!rooms[roomName]) {
      rooms[roomName] = { messages: [] };
    }
    rooms[roomName].messages.push(fullMessage);

    // Broadcast to everyone in the room
    io.to(roomName).emit("new-message", fullMessage);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
