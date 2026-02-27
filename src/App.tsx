import React, { useState, useEffect, useRef } from "react";
import { Peer, DataConnection } from "peerjs";
import {
  Send,
  Paperclip,
  LogOut,
  MessageSquare,
  User,
  Download,
  Clock,
  ChevronRight,
  Plus,
  Share2,
  ShieldCheck
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow } from "date-fns";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FileData {
  name: string;
  type: string;
  data: string;
}

interface Message {
  id: string;
  sender: string | null;
  text?: string;
  file?: FileData;
  timestamp: number;
  type?: "system";
  systemType?: "join" | "leave";
}

export default function App() {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isHost, setIsHost] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const setupPeer = (id: string, asHost: boolean) => {
    const newPeer = new Peer(id);

    newPeer.on("open", (peerId) => {
      console.log("My peer ID is: " + peerId);
      setIsConnected(true);
      setCurrentRoom(id);
      setIsHost(asHost);
    });

    newPeer.on("connection", (conn) => {
      conn.on("data", (data: any) => {
        handleReceivedData(data, conn);
      });
      setConnections((prev) => [...prev, conn]);

      // If host, notify about the join
      if (asHost) {
        const joinMsg: Message = {
          id: `sys-${Date.now()}`,
          sender: null,
          text: `Someone joined the room`,
          timestamp: Date.now(),
          type: "system",
          systemType: "join",
        };
        addMessage(joinMsg);
        broadcast(joinMsg, [conn]);
      }
    });

    newPeer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "unavailable-id" && !asHost) {
        // If we tried to join but ID is available, it means no one is hosting.
        // We could potentially become the host here or show error.
      }
      setIsConnected(false);
    });

    setPeer(newPeer);
  };

  const handleReceivedData = (data: any, fromConn: DataConnection) => {
    const msg = data as Message;
    addMessage(msg);

    // If I am the host, I need to broadcast this to all other peers
    if (isHost) {
      broadcast(msg, [fromConn]);
    }
  };

  const addMessage = (msg: Message) => {
    setMessages((prev) => {
      if (prev.find(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  };

  const broadcast = (msg: Message, excludeConns: DataConnection[] = []) => {
    connections.forEach(conn => {
      if (!excludeConns.includes(conn)) {
        conn.send(msg);
      }
    });
  };

  const handleJoinOrCreate = (e: React.FormEvent, type: "host" | "join") => {
    e.preventDefault();
    if (!roomName.trim()) return;

    const peerId = `ppchat-room-${roomName.trim()}`;

    if (type === "host") {
      setupPeer(peerId, true);
    } else {
      const newPeer = new Peer();
      newPeer.on("open", () => {
        const conn = newPeer.connect(peerId);
        conn.on("open", () => {
          setIsConnected(true);
          setCurrentRoom(roomName.trim());
          setIsHost(false);
          setConnections([conn]);

          const joinInfo: Message = {
            id: `sys-init-${Date.now()}`,
            sender: username.trim() || "Anonymous",
            text: `${username.trim() || "Anonymous"} joined`,
            timestamp: Date.now(),
            type: "system",
            systemType: "join"
          };
          conn.send(joinInfo);
        });
        conn.on("data", (data) => handleReceivedData(data, conn));
      });
      setPeer(newPeer);
    }
  };

  const handleLeaveRoom = () => {
    peer?.destroy();
    window.location.reload();
  };

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !peer) return;

    const fullMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      sender: username.trim() || "Anonymous",
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    addMessage(fullMessage);

    if (isHost) {
      broadcast(fullMessage);
    } else {
      connections[0]?.send(fullMessage);
    }

    setInputText("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !peer) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      const fileMsg: Message = {
        id: Math.random().toString(36).substring(2, 9),
        sender: username.trim() || "Anonymous",
        file: {
          name: file.name,
          type: file.type,
          data: base64Data,
        },
        timestamp: Date.now(),
      };

      addMessage(fileMsg);
      if (isHost) {
        broadcast(fileMsg);
      } else {
        connections[0]?.send(fileMsg);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadFile = (file: FileData) => {
    const link = document.createElement("a");
    link.href = file.data;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chatMessages = messages.filter(m => !m.file);
  const fileMessages = messages.filter(m => m.file);

  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-black/5">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">PP P2P Chat</h1>
              <p className="text-slate-500 text-sm italic">Direct & Serverless</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 ml-1">
                Your Identity
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Anonymous"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700 placeholder:text-slate-300"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 ml-1">
                Room Access
              </label>
              <div className="relative">
                <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Enter unique room name..."
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700 placeholder:text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={(e) => handleJoinOrCreate(e, "host")}
                  className="flex flex-col items-center gap-2 bg-slate-900 text-white p-4 rounded-2xl hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  <Share2 size={24} />
                  <span className="text-xs font-bold uppercase tracking-wider">Host Room</span>
                </button>
                <button
                  onClick={(e) => handleJoinOrCreate(e, "join")}
                  className="flex flex-col items-center gap-2 bg-emerald-500 text-white p-4 rounded-2xl hover:bg-emerald-600 transition-all active:scale-95 shadow-lg shadow-emerald-100"
                >
                  <ChevronRight size={24} />
                  <span className="text-xs font-bold uppercase tracking-wider">Join Room</span>
                </button>
              </div>
            </div>

            <p className="text-[10px] text-center text-slate-400 px-4">
              P2P Mode: Direct browser-to-browser connection. No messages are stored on any server.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#F5F5F0] flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-emerald-100">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 leading-none">{currentRoom}</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {isHost ? `Hosting (${connections.length} connected)` : "P2P Connected"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors text-sm font-medium"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Close Room</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Files */}
        <div className="hidden md:flex w-1/3 border-r border-black/5 bg-slate-50/50 flex-col">
          <div className="p-4 border-b border-black/5 bg-white/50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Paperclip size={14} /> Direct Files
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {fileMessages.map((msg) => (
              <div key={msg.id} className="bg-white p-3 rounded-xl border border-black/5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                    <Paperclip size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate text-slate-700">{msg.file?.name}</p>
                    <p className="text-[10px] text-slate-400">by {msg.sender}</p>
                  </div>
                  <button
                    onClick={() => downloadFile(msg.file!)}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-emerald-500"
                  >
                    <Download size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Chat */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => {
              if (msg.type === "system") {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-slate-100 text-slate-500">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              if (msg.file && !msg.text) return null;

              const isMe = msg.sender === (username.trim() || "Anonymous");
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    isMe ? "ml-auto items-end" : "items-start"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {msg.sender}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl p-3 shadow-sm text-sm message-text",
                      isMe
                        ? "bg-slate-900 text-white rounded-tr-none"
                        : "bg-slate-100 text-slate-700 rounded-tl-none"
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <footer className="p-4 border-t border-black/5 bg-slate-50/30">
            <form onSubmit={sendMessage} className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-white text-slate-400 rounded-xl hover:text-emerald-500 transition-all border border-black/5 shadow-sm"
              >
                <Paperclip size={20} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <input
                type="text"
                placeholder="Direct message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-white border border-black/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm shadow-sm"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="bg-emerald-500 text-white p-3 rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-md shadow-emerald-100"
              >
                <Send size={20} />
              </button>
            </form>
          </footer>
        </div>
      </div>
    </div>
  );
}
