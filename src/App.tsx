import React, { useState, useEffect, useRef } from "react";
import { Peer, DataConnection } from "peerjs";
import {
  Send,
  Paperclip,
  LogOut,
  Download,
  Plus,
  Share2,
  ShieldCheck,
  User,
  ChevronRight,
  File as FileIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  FolderOpen,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Maximize2,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Generate a persistent unique ID for the user to reliably distinguish "Me" from "Others"
const MY_ID = localStorage.getItem("ppchat-client-id") || Math.random().toString(36).substring(2, 15);
localStorage.setItem("ppchat-client-id", MY_ID);

interface Message {
  id: string;
  sender: string;
  senderId: string; // Used to distinguish "Me"
  text?: string;
  file?: {
    name: string;
    type: string;
    data: any;
    size?: number;
    previewUrl?: string;
    folderPath?: string;
  };
  timestamp: number;
  type?: "system";
  systemType?: "join" | "leave" | "error";
}

export default function App() {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [username, setUsername] = useState<string>(localStorage.getItem("ppchat-username") || "");
  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullPreviewUrl, setFullPreviewUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (username) localStorage.setItem("ppchat-username", username);
  }, [username]);

  const addMessage = (msg: Message) => {
    if (msg.file && msg.file.data && !msg.file.previewUrl) {
      const blob = createBlob(msg.file.data, msg.file.type);
      if (blob) msg.file.previewUrl = URL.createObjectURL(blob);
    }
    setMessages((prev) => (prev.find(m => m.id === msg.id) ? prev : [...prev, msg]));
  };

  const createBlob = (data: any, type: string) => {
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data], { type });
    if (typeof data === "string" && data.startsWith("data:")) {
      const parts = data.split(",");
      const bstr = atob(parts[1]);
      const n = bstr.length;
      const u8arr = new Uint8Array(n);
      for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
      return new Blob([u8arr], { type: parts[0].split(":")[1].split(";")[0] });
    }
    return null;
  };

  const broadcast = (msg: Message, excludeConns: DataConnection[] = []) => {
    connections.forEach(conn => {
      if (!excludeConns.some(e => e.peer === conn.peer)) conn.send(msg);
    });
  };

  const handleReceivedData = (data: any, fromConn: DataConnection) => {
    const msg = data as Message;
    addMessage(msg);
    if (isHost) broadcast(msg, [fromConn]);
  };

  const setupPeer = (id?: string) => {
    setError(null);
    setIsConnecting(true);
    const newPeer = id ? new Peer(id) : new Peer();

    newPeer.on("open", () => {
      if (id) {
        setIsConnected(true);
        setIsConnecting(false);
        setCurrentRoom(roomName.trim());
        setIsHost(true);
      }
    });

    newPeer.on("connection", (conn) => {
      conn.on("open", () => {
        setConnections(prev => [...prev, conn]);
        addMessage({
          id: `sys-${Date.now()}`,
          sender: "System",
          senderId: "system",
          text: `A peer connected`,
          timestamp: Date.now(),
          type: "system"
        });
      });
      conn.on("data", (data) => handleReceivedData(data, conn));
      conn.on("close", () => setConnections(prev => prev.filter(c => c.peer !== conn.peer)));
    });

    newPeer.on("error", (err) => {
      setIsConnecting(false);
      setError(err.type === "unavailable-id" ? "Room name is already taken." : `Connection error: ${err.type}`);
    });

    setPeer(newPeer);
    return newPeer;
  };

  const handleJoinOrCreate = (type: "host" | "join") => {
    if (!roomName.trim()) { setError("Please enter a room name"); return; }
    const roomId = `ppchat-rm-${roomName.trim().toLowerCase()}`;

    if (type === "host") {
      setupPeer(roomId);
    } else {
      setIsConnecting(true);
      const guestPeer = setupPeer();
      guestPeer.on("open", () => {
        const conn = guestPeer.connect(roomId, { reliable: true });
        conn.on("open", () => {
          setIsConnected(true);
          setIsConnecting(false);
          setIsHost(false);
          setCurrentRoom(roomName.trim());
          setConnections([conn]);
          conn.send({
            id: `sys-join-${Date.now()}`,
            sender: username.trim() || "Anonymous",
            senderId: MY_ID,
            text: `${username.trim() || "Anonymous"} joined the room`,
            timestamp: Date.now(),
            type: "system"
          });
        });
        conn.on("data", (data) => handleReceivedData(data, conn));
        conn.on("error", () => { setError("Could not connect to host."); setIsConnecting(false); });
      });
    }
  };

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !peer) return;

    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: username.trim() || "Anonymous",
      senderId: MY_ID,
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    addMessage(msg);
    if (isHost) broadcast(msg); else connections[0]?.send(msg);
    setInputText("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !peer) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const msg: Message = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: username.trim() || "Anonymous",
        senderId: MY_ID,
        file: {
          name: file.name,
          type: file.type || "application/octet-stream",
          data: file,
          size: file.size,
          folderPath: (file as any).webkitRelativePath || ""
        },
        timestamp: Date.now(),
      };
      addMessage(msg);
      if (isHost) broadcast(msg); else connections[0]?.send(msg);
    }
    if (e.target) e.target.value = "";
  };

  const downloadFile = (file: any) => {
    const blob = createBlob(file.data, file.type);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyRoomName = () => { navigator.clipboard.writeText(roomName); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon size={20} className="text-emerald-500" />;
    if (type.includes("video")) return <VideoIcon size={20} className="text-blue-500" />;
    return <FileIcon size={20} className="text-slate-400" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Subtle Background Decoration */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,#10b98110,transparent)] pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-50 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-emerald-50 rounded-full blur-3xl opacity-50" />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative z-10">
          <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-slate-100 p-8">
            <div className="flex flex-col items-center mb-10">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-4 p-2 border border-slate-50">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">PP P2P Chat</h1>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Direct Secure Connection</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Identity</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input
                    type="text" placeholder="Your name..." value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Room Name</label>
                <div className="relative">
                  <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input
                    type="text" placeholder="Enter room name..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-500 text-[11px] font-semibold bg-rose-50 p-3 rounded-xl border border-rose-100 flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-slate-200"
                >
                  {isConnecting ? <Loader2 size={20} className="animate-spin" /> : <><Share2 size={18} /><span className="text-[10px] uppercase">Host</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-emerald-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-100"
                >
                  {isConnecting ? <Loader2 size={20} className="animate-spin" /> : <><ChevronRight size={22} /><span className="text-[10px] uppercase">Join</span></>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#F8FAFC] text-slate-700 flex flex-col font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md p-1 border border-slate-50">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 leading-none">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-300 hover:text-emerald-500 transition-colors">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                {isHost ? `Hosting (${connections.length})` : "P2P Connected"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-xs mx-10 hidden md:flex relative group">
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-4 outline-none text-slate-600 text-xs font-bold focus:ring-2 focus:ring-emerald-500/10"
            placeholder="Change name..."
          />
        </div>

        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="text-slate-300 hover:text-rose-500 transition-all p-2 hover:bg-rose-50 rounded-xl">
          <LogOut size={20} />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Archive */}
        <div className="hidden lg:flex w-72 border-r border-slate-100 bg-white flex-col">
          <div className="p-5 border-b border-slate-50 flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Shared Files</h3>
            <FileIcon size={14} className="text-slate-300" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.filter(m => m.file).map((msg) => (
              <div key={msg.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col gap-3 group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-slate-50">{getFileIcon(msg.file!.type)}</div>
                  <div className="flex-1 min-w-0 pr-1">
                    <p className="text-[11px] font-bold truncate text-slate-700">{msg.file?.name}</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold mt-0.5 tracking-tight">{msg.sender}</p>
                  </div>
                </div>
                <button onClick={() => downloadFile(msg.file)} className="w-full bg-white text-emerald-600 border border-emerald-100 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all shadow-sm">Download</button>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px] opacity-20 pointer-events-none" />

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-6">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full bg-slate-50 text-slate-400 border border-slate-100">{msg.text}</span>
                  </div>
                );

                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";

                return (
                  <div key={msg.id} className={cn("flex flex-col w-full animate-in fade-in slide-in-from-bottom-2", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-2 px-2">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className={cn("bg-white border rounded-[2rem] shadow-sm max-w-sm overflow-hidden p-2", isMe ? "border-emerald-100 items-end" : "border-slate-100 items-start")}>
                        <div className="rounded-[1.5rem] overflow-hidden bg-slate-50">
                          {msg.file.type.includes("image") ? (
                            <img src={msg.file.previewUrl} className="w-full h-auto max-h-64 object-cover cursor-pointer hover:scale-105 transition-transform" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-auto max-h-64" />
                          ) : (
                            <div className="p-10 flex flex-col items-center justify-center gap-3">
                              <FileIcon size={40} className="text-slate-200" />
                              {msg.file.folderPath && <span className="text-[8px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md">FOLDER: {msg.file.folderPath.split('/')[0]}</span>}
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{msg.file.name}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-bold mt-0.5 tracking-tight font-mono">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => downloadFile(msg.file)} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-500 hover:text-white transition-all"><Download size={18} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-5 py-4 shadow-sm text-[15px] leading-relaxed font-medium transition-all", isMe ? "bg-emerald-500 text-white rounded-[1.75rem] rounded-tr-none max-w-[75%]" : "bg-white border border-slate-100 text-slate-700 rounded-[1.75rem] rounded-tl-none max-w-[75%]")}>
                        {msg.text}
                      </div>
                    )}
                    <span className="text-[9px] text-slate-200 font-bold mt-1.5 px-2 uppercase tracking-tight">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-6 bg-white border-t border-slate-100">
            <div className="max-w-4xl mx-auto flex gap-4 items-end">
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-emerald-500 rounded-2xl transition-all border border-slate-100"><Paperclip size={20} /></button>
                <button onClick={() => folderInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-emerald-500 rounded-2xl transition-all border border-slate-100"><FolderOpen size={20} /></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} webkitdirectory="" directory="" className="hidden" />

              <div className="flex-1 relative">
                <textarea
                  rows={1} placeholder="Type a secure message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none text-[15px] text-slate-700 transition-all resize-none shadow-inner focus:ring-2 focus:ring-emerald-500/10 max-h-32"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-14 h-14 flex items-center justify-center bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all disabled:opacity-30 disabled:grayscale active:scale-95 shadow-lg shadow-emerald-100"
              >
                <Send size={22} />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-6 right-6 text-white hover:bg-white/10 p-3 rounded-full transition-all"><X size={32} /></button>
            <img src={fullPreviewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        .message-text { word-break: break-all; white-space: pre-wrap; }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

declare module "react" {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> { webkitdirectory?: string; directory?: string; }
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
