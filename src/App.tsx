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
  X,
  MessagesSquare,
  Zap,
  Lock,
  MessageCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Persistent unique ID
const MY_ID = localStorage.getItem("ppchat-client-id") || Math.random().toString(36).substring(2, 15);
localStorage.setItem("ppchat-client-id", MY_ID);

interface Message {
  id: string;
  sender: string;
  senderId: string;
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

  const processFileMessage = (msg: Message) => {
    if (msg.file && msg.file.data && !msg.file.previewUrl) {
      const blob = createBlob(msg.file.data, msg.file.type);
      if (blob) {
        msg.file.previewUrl = URL.createObjectURL(blob);
      }
    }
    return msg;
  };

  const addMessage = (msg: Message) => {
    const processedMsg = processFileMessage(msg);
    setMessages((prev) => (prev.find(m => m.id === processedMsg.id) ? prev : [...prev, processedMsg]));
  };

  const createBlob = (data: any, type: string) => {
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data as any], { type });
    if (typeof data === "string" && data.startsWith("data:")) {
      const parts = data.split(",");
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new Blob([u8arr], { type: parts[0].split(":")[1].split(";")[0] });
    }
    if (data && typeof data === 'object') {
      try { return new Blob([data as any], { type }); } catch (e) { return null; }
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
    const cleanMsg = { ...msg, file: msg.file ? { ...msg.file, previewUrl: undefined } : undefined };
    addMessage(cleanMsg);
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
          text: `A peer initialised`,
          timestamp: Date.now(),
          type: "system"
        });
      });
      conn.on("data", (data) => handleReceivedData(data, conn));
      conn.on("close", () => setConnections(prev => prev.filter(c => c.peer !== conn.peer)));
    });

    newPeer.on("error", (err) => {
      setIsConnecting(false);
      setError(err.type === "unavailable-id" ? "Room busy." : `Error: ${err.type}`);
    });

    setPeer(newPeer);
    return newPeer;
  };

  const handleJoinOrCreate = (type: "host" | "join") => {
    if (!roomName.trim()) { setError("Enter room name"); return; }
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
            text: `${username.trim() || "Anonymous"} syncronised`,
            timestamp: Date.now(),
            type: "system"
          });
        });
        conn.on("data", (data) => handleReceivedData(data, conn));
        conn.on("error", () => { setError("Unreachable host."); setIsConnecting(false); });
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

  const copyRoomName = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon size={22} className="text-emerald-400" />;
    if (type.includes("video")) return <VideoIcon size={22} className="text-teal-400" />;
    return <FileIcon size={22} className="text-slate-500" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#020408] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Dynamic Background Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md z-10">
          <div className="bg-slate-900/40 backdrop-blur-3xl rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.6)] border border-white/5 p-10 relative overflow-hidden">
            {/* Subtle internal glow */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 blur-[80px] -z-10" />

            <div className="flex items-center gap-5 mb-12 relative">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-[2rem] flex items-center justify-center shadow-[0_15px_35px_rgba(16,185,129,0.25)] border border-white/10 group overflow-hidden">
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <MessagesSquare className="text-white w-10 h-10 group-hover:scale-110 transition-transform duration-500" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-2">
                  PPChat <span className="text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"><Zap size={24} /></span>
                </h1>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Dark Protokol v2.5</p>
                </div>
              </div>
            </div>

            <div className="space-y-7">
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Identity</label>
                  <Lock size={12} className="text-slate-700" />
                </div>
                <div className="relative group">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={20} />
                  <input
                    type="text" placeholder="Callsign Name..." value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-5 pl-14 pr-6 outline-none text-white text-base font-bold focus:border-emerald-500/40 focus:ring-4 focus:ring-emerald-500/5 transition-all shadow-inner placeholder:text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Protocol Room</label>
                  <ShieldCheck size={12} className="text-slate-700" />
                </div>
                <div className="relative group">
                  <Plus className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={20} />
                  <input
                    type="text" placeholder="Connect Code..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-5 pl-14 pr-6 outline-none text-white text-base font-bold focus:border-emerald-500/40 focus:ring-4 focus:ring-emerald-500/5 transition-all shadow-inner placeholder:text-slate-700"
                  />
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-rose-400 text-xs font-bold bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20 flex items-center gap-4">
                  <AlertCircle size={18} /> {error}
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-5 pt-3">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-white/5 text-white border border-white/10 py-7 rounded-[2rem] font-black flex flex-col items-center justify-center gap-3 hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50 group shadow-2xl overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {isConnecting ? <Loader2 size={24} className="animate-spin text-emerald-500" /> : <><Share2 size={24} className="group-hover:text-emerald-400 transition-colors" /><span className="text-[10px] uppercase tracking-[0.2em] font-black">Broadcast</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-emerald-600 text-white py-7 rounded-[2rem] font-black flex flex-col items-center justify-center gap-3 hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-50 shadow-[0_15px_40px_rgba(16,185,129,0.3)] border border-emerald-400/20 group relative overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
                  {isConnecting ? <Loader2 size={24} className="animate-spin text-white" /> : <><ChevronRight size={32} className="group-hover:translate-x-1 transition-transform" /><span className="text-[10px] uppercase tracking-[0.2em] font-black underline-offset-4 decoration-emerald-300">Synchronize</span></>}
                </button>
              </div>
            </div>
          </div>

          <p className="text-center mt-10 text-slate-600 text-[10px] uppercase tracking-[0.5em] font-black opacity-50">Secure Peer-to-Peer Link</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#020408] text-slate-300 flex flex-col font-sans overflow-hidden font-medium">
      <header className="bg-slate-900/60 backdrop-blur-3xl border-b border-white/5 px-4 sm:px-10 py-5 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[1.2rem] flex items-center justify-center shadow-[0_8px_20px_rgba(16,185,129,0.2)] border border-white/10 shrink-0 group">
            <MessagesSquare className="text-white w-7 h-7 group-hover:rotate-12 transition-transform" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <h2 className="font-black text-white text-xl truncate tracking-tighter">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-600 hover:text-emerald-400 transition-colors shrink-0 p-1.5 bg-white/5 rounded-lg border border-white/5">
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
              <p className="text-[10px] text-emerald-500/70 font-black uppercase tracking-[0.2em]">
                {isHost ? `Broadcasting` : "Synchronized"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-sm mx-10 hidden lg:flex items-center gap-4 bg-black/40 border border-white/5 rounded-2xl px-5 py-3 shadow-inner group focus-within:border-emerald-500/30 transition-all">
          <User size={16} className="text-slate-600 group-focus-within:text-emerald-400 transition-colors" />
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-white text-xs font-black placeholder:text-slate-700"
            placeholder="Identity Tag..."
          />
        </div>

        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="text-slate-600 hover:text-rose-400 transition-all p-3 hover:bg-rose-500/10 rounded-2xl border border-transparent hover:border-rose-500/20 group">
          <LogOut size={24} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Vault */}
        <div className="hidden lg:flex w-85 border-r border-white/5 bg-slate-900/30 flex-col relative overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
            <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500 flex items-center gap-3">
              <FolderOpen size={14} className="text-emerald-500" /> Asset Vault
            </h3>
            <div className="w-2 h-2 rounded-full bg-teal-500/50 shadow-[0_0_10px_rgba(20,184,166,0.5)]" />
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {messages.filter(m => m.file).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-20">
                <ShieldCheck size={48} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">No protocol assets detected</p>
              </div>
            ) : (
              messages.filter(m => m.file).map((msg) => (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={msg.id} className="bg-black/40 p-5 rounded-[2rem] border border-white/5 flex flex-col gap-4 group hover:border-emerald-500/30 transition-all shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-slate-800/40 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 shadow-inner group-hover:bg-emerald-500/10 transition-colors">{getFileIcon(msg.file!.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate text-white">{msg.file?.name}</p>
                      <p className="text-[9px] text-emerald-500/50 uppercase font-black mt-1 tracking-[0.2em]">{msg.sender}</p>
                    </div>
                  </div>
                  <button onClick={() => downloadFile(msg.file)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-[0_10px_20px_rgba(16,185,129,0.15)] active:scale-95">Fetch Protocol Asset</button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#020408] overflow-hidden relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-emerald-600/[0.04] rounded-full blur-[160px] pointer-events-none -z-10" />

          <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-10 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto space-y-10">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 mt-20">
                  <MessageCircle size={64} className="mb-6 text-emerald-500" />
                  <h2 className="text-2xl font-black uppercase tracking-[0.5em]">Protocol Established</h2>
                  <p className="text-xs font-bold mt-4 tracking-widest uppercase">Awaiting encrypted peer data...</p>
                </div>
              )}
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-8">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] px-8 py-2.5 rounded-full bg-black/50 text-emerald-500 shadow-2xl backdrop-blur-md border border-emerald-500/10 flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> {msg.text}
                    </span>
                  </div>
                );

                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";

                return (
                  <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} key={msg.id} className={cn("flex flex-col w-full", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-3 px-4 flex items-center gap-2">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className={cn("bg-slate-900/60 backdrop-blur-md border rounded-[3rem] shadow-[0_30px_70px_rgba(0,0,0,0.6)] max-w-[90%] sm:max-w-md overflow-hidden p-2.5 group transition-all", isMe ? "border-emerald-500/30" : "border-white/5")}>
                        <div className="rounded-[2.6rem] overflow-hidden bg-black/40 group relative aspect-video flex items-center justify-center">
                          {msg.file.type.includes("image") ? (
                            <img src={msg.file.previewUrl} className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-1000" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-full object-cover" />
                          ) : (
                            <div className="p-12 flex flex-col items-center justify-center gap-5">
                              <FileIcon size={56} className="text-slate-800" />
                              {msg.file.folderPath && <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full shadow-inner border border-emerald-500/20">PROTOCOL PATH: {msg.file.folderPath.split('/')[0]}</span>}
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>
                        <div className="p-6 flex items-center justify-between gap-6">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-white truncate leading-tight tracking-tight">{msg.file.name}</p>
                            <p className="text-[11px] text-emerald-500 font-black mt-2 tracking-tighter opacity-60 uppercase">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => downloadFile(msg.file)} className="w-16 h-16 bg-emerald-600 text-white rounded-[1.6rem] hover:bg-emerald-500 transition-all flex items-center justify-center shadow-xl shadow-emerald-950 border border-emerald-400/20 active:scale-95"><Download size={24} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-8 py-6 shadow-2xl text-[17px] leading-relaxed font-bold tracking-tight transition-all relative overflow-hidden group", isMe ? "bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-[2.5rem] rounded-tr-none shadow-emerald-500/10" : "bg-slate-900/60 backdrop-blur-md border border-white/5 text-slate-200 rounded-[2.5rem] rounded-tl-none")}>
                        {isMe && <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-3xl -z-0 pointer-events-none" />}
                        <span className="relative z-10">{msg.text}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3.5 px-5">
                      <span className="text-[10px] text-slate-800 font-black uppercase tracking-tighter italic mr-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && (
                        <div className="flex -space-x-1">
                          <Check size={12} className="text-emerald-500/80" />
                          <Check size={12} className="text-emerald-500/40" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-5 sm:p-10 bg-[#020408]/80 backdrop-blur-3xl border-t border-white/5 shrink-0 shadow-[0_-30px_70px_rgba(0,0,0,0.8)]">
            <div className="max-w-4xl mx-auto flex gap-4 sm:gap-6 items-center">
              <div className="flex gap-3 shrink-0">
                <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 flex items-center justify-center bg-black/40 text-slate-600 hover:text-emerald-400 hover:bg-black/60 rounded-2xl transition-all border border-white/5 shadow-inner group">
                  <Paperclip size={24} className="group-hover:rotate-45 transition-transform" />
                </button>
                <button onClick={() => folderInputRef.current?.click()} className="w-16 h-16 flex items-center justify-center bg-black/40 text-slate-600 hover:text-emerald-400 hover:bg-black/60 rounded-2xl transition-all border border-white/5 shadow-inner group">
                  <FolderOpen size={24} className="group-hover:translate-y-[-2px] transition-transform" />
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input
                type="file"
                ref={folderInputRef}
                onChange={handleFileUpload}
                {...{ webkitdirectory: "", directory: "" } as any}
                className="hidden"
              />

              <div className="flex-1 flex items-center bg-black/40 border border-white/5 rounded-[2rem] px-8 py-5 shadow-inner focus-within:border-emerald-500/40 focus-within:ring-4 focus-within:ring-emerald-500/5 transition-all">
                <textarea
                  rows={1} placeholder="Protocol input message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-transparent border-none outline-none text-[16px] text-white transition-all resize-none max-h-40 font-bold placeholder:text-slate-800"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-18 h-18 shrink-0 flex items-center justify-center bg-gradient-to-tr from-emerald-600 to-teal-500 text-white rounded-[1.8rem] hover:shadow-[0_15px_35px_rgba(16,185,129,0.4)] transition-all disabled:opacity-20 active:scale-90 border border-emerald-400/30 group disabled:grayscale"
              >
                <Send size={28} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#020408]/98 backdrop-blur-3xl flex items-center justify-center p-6">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-10 right-10 text-slate-500 hover:text-white transition-all bg-white/5 p-5 rounded-[1.5rem] border border-white/10 shadow-2xl"><X size={36} /></button>
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="relative">
              <img src={fullPreviewUrl} alt="Visual focus" className="max-w-full max-h-[85vh] object-contain rounded-[3rem] shadow-[0_0_150px_rgba(16,185,129,0.15)] border border-white/10" />
              <div className="absolute inset-0 rounded-[3rem] ring-1 ring-white/10 pointer-events-none" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.2); }
        .message-text { word-break: break-all; white-space: pre-wrap; }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
