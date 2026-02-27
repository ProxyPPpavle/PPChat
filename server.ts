import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e7, // 10MB limit
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

const PORT = 3000;

interface Message {
  id: string;
  sender: string | null;
  text?: string;
  file?: {
    name: string;
    type: string;
    data: string;
  };
  timestamp: number;
  type?: "system";
  systemType?: "join" | "leave";
}

const rooms: Record<string, { messages: Message[] }> = {};
const socketToUser: Record<string, { username: string | null; room: string }> = {};

// Cleanup logic: Remove messages older than 10 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
const MESSAGE_TTL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach((roomName) => {
    rooms[roomName].messages = rooms[roomName].messages.filter(
      (msg) => now - msg.timestamp < MESSAGE_TTL
    );
  });
}, CLEANUP_INTERVAL);

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomName, username }: { roomName: string; username: string | null }) => {
    socket.join(roomName);
    if (!rooms[roomName]) {
      rooms[roomName] = { messages: [] };
    }

    socketToUser[socket.id] = { username, room: roomName };

    const joinMsg: Message = {
      id: `sys-${Date.now()}`,
      sender: null,
      text: `${username || "Anonymous"} has joined the room`,
      timestamp: Date.now(),
      type: "system",
      systemType: "join",
    };

    rooms[roomName].messages.push(joinMsg);
    socket.emit("room-history", rooms[roomName].messages);
    socket.to(roomName).emit("new-message", joinMsg);
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

    io.to(roomName).emit("new-message", fullMessage);
  });

  socket.on("disconnect", () => {
    const userData = socketToUser[socket.id];
    if (userData) {
      const { username, room } = userData;
      const leaveMsg: Message = {
        id: `sys-out-${Date.now()}`,
        sender: null,
        text: `${username || "Anonymous"} has left the room`,
        timestamp: Date.now(),
        type: "system",
        systemType: "leave",
      };
      if (rooms[room]) {
        rooms[room].messages.push(leaveMsg);
      }
      io.to(room).emit("new-message", leaveMsg);
      delete socketToUser[socket.id];
    }
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
