import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Send, 
  Paperclip, 
  LogOut, 
  MessageSquare, 
  User, 
  Download, 
  Clock,
  ChevronRight,
  Plus
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [username, setUsername] = useState<string>("");
  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newSocket = io({
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      timeout: 20000,
    });
    setSocket(newSocket);

    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    newSocket.on("room-history", (history: Message[]) => {
      setMessages(history);
    });

    newSocket.on("new-message", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !socket) return;
    
    socket.emit("join-room", { 
      roomName: roomName.trim(), 
      username: username.trim() || "Anonymous" 
    });
    setCurrentRoom(roomName.trim());
  };

  const handleLeaveRoom = () => {
    if (!currentRoom || !socket) return;
    socket.disconnect();
    window.location.reload(); // Simplest way to reset state and leave
  };

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim()) || !currentRoom || !socket) return;

    socket.emit("send-message", {
      roomName: currentRoom,
      message: {
        sender: username.trim() || "Anonymous",
        text: inputText.trim(),
      },
    });
    setInputText("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentRoom || !socket) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      socket.emit("send-message", {
        roomName: currentRoom,
        message: {
          sender: username.trim() || "Anonymous",
          file: {
            name: file.name,
            type: file.type,
            data: base64Data,
          },
        },
      });
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
              <MessageSquare size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">PP Chat</h1>
              <p className="text-slate-500 text-sm italic">Ephemeral & Private</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 ml-1">
                Your Identity (Optional)
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

            <form onSubmit={handleJoinRoom}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 ml-1">
                Room Name
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    placeholder="Enter room name..."
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700 placeholder:text-slate-300"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </form>
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
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 leading-none">{currentRoom}</h2>
            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Live Session</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
            <User size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-600">{username || "Anonymous"}</span>
          </div>
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors text-sm font-medium"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Files */}
        <div className="w-1/3 border-r border-black/5 bg-slate-50/50 flex flex-col">
          <div className="p-4 border-b border-black/5 bg-white/50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Paperclip size={14} /> Shared Files
            </h3>
            <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
              {fileMessages.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {fileMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 text-center p-4">
                <Paperclip size={24} className="mb-2 opacity-20" />
                <p className="text-[10px] font-medium italic">No files shared yet</p>
              </div>
            ) : (
              fileMessages.map((msg) => (
                <div key={msg.id} className="bg-white p-3 rounded-xl border border-black/5 shadow-sm group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                      <Paperclip size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-slate-700">{msg.file?.name}</p>
                      <p className="text-[10px] text-slate-400">
                        by {msg.sender} • {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadFile(msg.file!)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-emerald-500 transition-all"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Chat */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatMessages.map((msg) => {
              if (msg.type === "system") {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full",
                      msg.systemType === "join" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                    )}>
                      {msg.text}
                    </span>
                  </div>
                );
              }

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
                    <span className="text-[10px] text-slate-300">
                      {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl p-3 shadow-sm text-sm",
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
                placeholder="Message..."
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
