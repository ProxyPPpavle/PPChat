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
  MessageCircle,
  Activity
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
    localStorage.setItem("ppchat-username", username);
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

    const currentName = username.trim() || "Anonymous";

    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: currentName,
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
    const currentName = username.trim() || "Anonymous";
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const msg: Message = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: currentName,
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
    if (type.includes("image")) return <ImageIcon size={20} className="text-emerald-400" />;
    if (type.includes("video")) return <VideoIcon size={20} className="text-teal-400" />;
    return <FileIcon size={20} className="text-slate-500" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#030508] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        {/* Modern Background Details */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05),transparent_70%)] pointer-events-none" />
        <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-emerald-600/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-teal-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="w-full max-w-sm z-10">
          <div className="bg-[#0c111d] rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.9)] border-2 border-white/[0.08] p-8 sm:p-10 relative overflow-hidden">
            {/* Subtle internal top highlight */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="flex flex-col items-center mb-10 relative">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(255,255,255,0.1)] mb-6 group border border-emerald-500/30">
                <MessagesSquare className="text-black w-8 h-8 group-hover:scale-110 transition-transform duration-500" />
              </div>
              <h1 className="text-3xl font-black text-white tracking-tighter">PPChat</h1>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">P2P Communication</p>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Identity Tag</label>
                  <User size={12} className="text-emerald-500 opacity-50" />
                </div>
                <div className="relative group">
                  <input
                    type="text" placeholder="Callsign..." value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/60 border-2 border-white/10 rounded-2xl py-4.5 px-6 outline-none text-white text-base font-bold focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Protocol Room</label>
                  <Activity size={12} className="text-emerald-500 opacity-50" />
                </div>
                <div className="relative group">
                  <input
                    type="text" placeholder="Connect Code..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-black/60 border-2 border-white/10 rounded-2xl py-4.5 px-6 outline-none text-white text-base font-bold focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-400 text-xs font-bold bg-rose-500/10 px-5 py-4 rounded-xl border-2 border-rose-500/20 flex items-center gap-3 animate-shake">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-5 pt-2">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-white text-black py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-2.5 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50 group shadow-[0_15px_40px_rgba(255,255,255,0.08)] border border-white/20"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin" /> : <><Share2 size={24} className="group-hover:scale-110 transition-transform" /><span>Host</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-emerald-600 text-white py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-2.5 hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-50 shadow-[0_15px_40px_rgba(16,185,129,0.2)] border border-emerald-400/30 group"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin text-white" /> : <><ChevronRight size={28} className="group-hover:translate-x-1 transition-transform" /><span>Join</span></>}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-10 flex items-center justify-center gap-4 opacity-40">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-slate-700" />
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">Secure Node Link</p>
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-slate-700" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#030508] text-slate-400 flex flex-col font-sans overflow-hidden">
      <header className="bg-[#0c111d]/80 backdrop-blur-2xl border-b-2 border-white/[0.08] px-6 sm:px-12 py-5 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-13 h-13 bg-white rounded-xl flex items-center justify-center shadow-2xl border border-emerald-500/20 shrink-0">
            <MessagesSquare className="text-black w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <h2 className="font-black text-white text-xl truncate tracking-tighter">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-500 hover:text-emerald-400 transition-colors shrink-0 p-2 bg-white/5 rounded-lg border border-white/10 shadow-sm">
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse" />
              <p className="text-[10px] text-emerald-500/90 font-black uppercase tracking-[0.3em]">Protocol Active</p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-sm mx-12 hidden lg:flex items-center gap-4 bg-black/60 border-2 border-white/10 rounded-2xl px-5 py-3 group focus-within:border-emerald-500/40 transition-all shadow-inner">
          <User size={16} className="text-emerald-500/50 group-focus-within:text-emerald-500" />
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-white text-[13px] font-black placeholder:text-slate-800"
            placeholder="Identity Name..."
          />
        </div>

        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="text-slate-500 hover:text-rose-400 transition-all p-3 hover:bg-rose-500/10 rounded-2xl border-2 border-white/[0.05] group">
          <LogOut size={22} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Vault */}
        <div className="hidden lg:flex w-85 border-r-2 border-white/[0.08] bg-[#0c111d]/40 flex-col relative overflow-hidden backdrop-blur-md">
          <div className="p-6 border-b-2 border-white/[0.08] flex items-center justify-between bg-black/30">
            <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 flex items-center gap-3">
              <FolderOpen size={14} className="text-emerald-500" /> Asset Vault
            </h3>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg border border-emerald-500/30 font-black tracking-[0.2em]">P2P FILES</span>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {messages.filter(m => m.file).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-10 text-center grayscale p-10">
                <ShieldCheck size={48} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Assets Detected</p>
              </div>
            ) : (
              messages.filter(m => m.file).map((msg) => (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={msg.id} className="bg-black/40 p-5 rounded-[2rem] border-2 border-white/[0.05] flex flex-col gap-4 group hover:border-emerald-500/40 transition-all shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">{getFileIcon(msg.file!.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate text-white">{msg.file?.name}</p>
                      <p className="text-[10px] text-emerald-500/50 uppercase font-black tracking-widest truncate mt-1">{msg.sender}</p>
                    </div>
                  </div>
                  <button onClick={() => downloadFile(msg.file)} className="w-full bg-emerald-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-lg active:scale-95 outline-none hover:bg-emerald-500">Download Link</button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#030508] overflow-hidden relative border-l-2 border-white/[0.08]">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.02),transparent_60%)] pointer-events-none" />

          <div className="flex-1 overflow-y-auto p-4 sm:p-12 space-y-10 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto space-y-10">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-10 mt-24">
                  <MessageCircle size={64} className="mb-6 text-emerald-500" />
                  <h2 className="text-2xl font-black uppercase tracking-[0.6em] text-white">Encrypted</h2>
                </div>
              )}
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-10">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] px-10 py-3 rounded-2xl bg-[#0c111d] text-emerald-500 border-2 border-emerald-500/20 backdrop-blur-md shadow-3xl flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {msg.text}
                    </span>
                  </div>
                );

                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";

                return (
                  <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} key={msg.id} className={cn("flex flex-col w-full", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-600 mb-3 px-6">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className={cn("bg-[#0c111d] border-2 rounded-[3rem] shadow-[0_30px_70px_rgba(0,0,0,0.7)] max-w-[90%] sm:max-w-md overflow-hidden p-3 group transition-all", isMe ? "border-emerald-500/40" : "border-white/20")}>
                        <div className="rounded-[2.4rem] overflow-hidden bg-black/40 group relative aspect-video flex items-center justify-center border border-white/5">
                          {msg.file.type.includes("image") ? (
                            <img src={msg.file.previewUrl} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-1000" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-full object-cover" />
                          ) : (
                            <div className="p-12 flex flex-col items-center gap-6">
                              <FileIcon size={56} className="text-slate-800" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="p-6 flex items-center justify-between gap-6">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-white truncate leading-tight tracking-tight">{msg.file.name}</p>
                            <p className="text-[11px] text-emerald-500 font-black mt-2 uppercase tracking-tighter opacity-80">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => downloadFile(msg.file)} className="w-14 h-14 bg-white text-black rounded-[1.3rem] hover:bg-slate-100 transition-all flex items-center justify-center shadow-xl active:scale-90 border border-white"><Download size={22} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-8 py-5 shadow-2xl text-[16px] font-bold tracking-tight transition-all border-2 relative overflow-hidden",
                        isMe ? "bg-emerald-600 text-white rounded-[2.5rem] rounded-tr-none border-emerald-400/30" : "bg-white text-black rounded-[2.5rem] rounded-tl-none border-white")}>
                        {msg.text}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 px-6 opacity-40">
                      <span className="text-[9px] text-slate-500 font-black uppercase italic">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && <div className="flex -space-x-1"><Check size={10} className="text-emerald-500" /><Check size={10} className="text-emerald-500/50" /></div>}
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-6 sm:p-12 bg-[#0c111d]/90 backdrop-blur-3xl border-t-2 border-white/[0.08] shrink-0 shadow-[0_-30px_70px_rgba(0,0,0,0.8)]">
            <div className="max-w-4xl mx-auto flex gap-4 sm:gap-6 items-center">
              <div className="flex gap-3 shrink-0">
                <button onClick={() => fileInputRef.current?.click()} className="w-15 h-15 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 rounded-2xl transition-all border-2 border-emerald-400/30 shadow-lg group">
                  <Paperclip size={24} className="group-hover:rotate-45 transition-transform" />
                </button>
                <button onClick={() => folderInputRef.current?.click()} className="w-15 h-15 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 rounded-2xl transition-all border-2 border-emerald-400/30 shadow-lg group">
                  <FolderOpen size={24} className="group-hover:scale-110 transition-transform" />
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

              <div className="flex-1 flex items-center bg-black/60 border-2 border-white/15 rounded-[2rem] px-8 py-5 shadow-inner focus-within:border-emerald-500/50 focus-within:ring-4 focus-within:ring-emerald-500/5 transition-all">
                <textarea
                  rows={1} placeholder="Type a secure message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-transparent border-none outline-none text-[16px] text-white transition-all resize-none max-h-40 font-bold placeholder:text-slate-800"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-18 h-18 shrink-0 flex items-center justify-center bg-emerald-600 text-white rounded-[1.8rem] transition-all disabled:opacity-20 active:scale-90 border-2 border-emerald-400/40 shadow-[0_15px_40px_rgba(16,185,129,0.3)] group hover:bg-emerald-500"
              >
                <Send size={28} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#030508]/98 backdrop-blur-3xl flex items-center justify-center p-8">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-12 right-12 text-slate-500 hover:text-white transition-all bg-white/5 p-5 rounded-2xl border-2 border-white/10 shadow-2xl"><X size={36} /></button>
            <motion.div initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }}>
              <img src={fullPreviewUrl} alt="Visual focus" className="max-w-full max-h-[85vh] object-contain rounded-[3rem] shadow-[0_0_120px_rgba(16,185,129,0.15)] border-2 border-white/10" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.2); }
        .message-text { word-break: break-all; white-space: pre-wrap; }
        textarea::-webkit-scrollbar { display: none; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
