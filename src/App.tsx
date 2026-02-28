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

    // Use current trimmed username from state
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
      <div className="min-h-screen bg-[#030508] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Modern Background Details */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.03),transparent_70%)] pointer-events-none" />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm z-10">
          <div className="bg-slate-900/30 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10 p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -z-10" />

            <div className="flex flex-col items-center mb-10 relative">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl mb-5 group border border-emerald-500/20">
                <MessagesSquare className="text-black w-8 h-8 group-hover:scale-110 transition-transform duration-500" />
              </div>
              <h1 className="text-3xl font-black text-white tracking-tighter">PPChat</h1>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em]">P2P Communication</p>
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Identity Tag</label>
                <div className="relative group">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-400 transition-colors" size={16} />
                  <input
                    type="text" placeholder="Your callsign..." value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-6 outline-none text-white text-sm font-bold focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Protocol Room</label>
                <div className="relative group">
                  <Activity className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-400 transition-colors" size={16} />
                  <input
                    type="text" placeholder="Connect code..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-6 outline-none text-white text-sm font-bold focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-400 text-[10px] font-black bg-rose-500/5 px-4 py-3 rounded-xl border border-rose-500/10 flex items-center gap-3">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-white text-black py-5 rounded-[1.8rem] font-bold text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50 group shadow-xl"
                >
                  {isConnecting ? <Loader2 size={18} className="animate-spin" /> : <><Share2 size={20} className="group-hover:rotate-12 transition-transform" /><span>Host</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-emerald-600/90 text-white py-5 rounded-[1.8rem] font-bold text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-2 hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-900/20 border border-emerald-400/20 group"
                >
                  {isConnecting ? <Loader2 size={18} className="animate-spin text-white" /> : <><ChevronRight size={22} className="group-hover:translate-x-1 transition-transform" /><span>Join</span></>}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-center gap-3 opacity-30">
            <div className="h-px w-8 bg-slate-700" />
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-500">Secure Node Link</p>
            <div className="h-px w-8 bg-slate-700" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#030508] text-slate-400 flex flex-col font-sans overflow-hidden">
      <header className="bg-slate-900/20 backdrop-blur-2xl border-b border-white/10 px-6 sm:px-10 py-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-5">
          <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-2xl border border-emerald-500/10 shrink-0">
            <MessagesSquare className="text-black w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="font-black text-white text-lg truncate tracking-tighter">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-600 hover:text-emerald-400 transition-colors shrink-0 p-1.5 bg-white/5 rounded-lg border border-white/5 shadow-sm">
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <p className="text-[9px] text-emerald-500/80 font-black uppercase tracking-[0.2em]">P2P Link</p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-xs mx-8 hidden lg:flex items-center gap-3 bg-black/40 border border-white/5 rounded-xl px-4 py-2 group focus-within:border-emerald-500/20 transition-all shadow-inner">
          <User size={14} className="text-slate-600 group-focus-within:text-emerald-400" />
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-white text-[11px] font-black placeholder:text-slate-700"
            placeholder="Change callsign..."
          />
        </div>

        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="text-slate-600 hover:text-rose-400 transition-all p-2.5 hover:bg-rose-500/5 rounded-xl border border-white/5 group">
          <LogOut size={20} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Vault */}
        <div className="hidden lg:flex w-80 border-r border-white/10 bg-slate-900/10 flex-col relative overflow-hidden backdrop-blur-sm">
          <div className="p-5 border-b border-white/5 flex items-center justify-between bg-black/20">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
              <FolderOpen size={12} className="text-emerald-500" /> Asset Vault
            </h3>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/20 font-black tracking-widest">SECURE</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.filter(m => m.file).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-10 text-center">
                <ShieldCheck size={40} className="mb-3" />
                <p className="text-[9px] font-black uppercase tracking-widest">No assets</p>
              </div>
            ) : (
              messages.filter(m => m.file).map((msg) => (
                <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} key={msg.id} className="bg-black/30 p-4 rounded-3xl border border-white/5 flex flex-col gap-3 group hover:border-emerald-500/30 transition-all shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-800/20 rounded-xl flex items-center justify-center shrink-0 border border-white/5 group-hover:bg-emerald-500/5 transition-colors">{getFileIcon(msg.file!.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black truncate text-white">{msg.file?.name}</p>
                      <p className="text-[9px] text-emerald-500/50 uppercase font-black tracking-widest truncate">{msg.sender}</p>
                    </div>
                  </div>
                  <button onClick={() => downloadFile(msg.file)} className="w-full bg-emerald-600/80 hover:bg-emerald-500 text-white py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all shadow-sm active:scale-95 outline-none ring-offset-black focus:ring-1 ring-emerald-500/50">Download</button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#05070a] overflow-hidden relative border-l border-white/5">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.01),transparent_50%)] pointer-events-none" />

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto space-y-8">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-15 mt-20 grayscale">
                  <MessageCircle size={48} className="mb-4 text-emerald-500" />
                  <h2 className="text-xl font-black uppercase tracking-[0.4em]">Ready for link</h2>
                </div>
              )}
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-6">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] px-6 py-2 rounded-lg bg-black/40 text-emerald-500 border border-emerald-500/10 backdrop-blur-md shadow-2xl flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> {msg.text}
                    </span>
                  </div>
                );

                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";

                return (
                  <motion.div initial={{ opacity: 0, scale: 0.99, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} key={msg.id} className={cn("flex flex-col w-full", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 mb-2 px-4">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className={cn("bg-slate-900/40 backdrop-blur-sm border rounded-[2rem] shadow-2xl max-w-[85%] sm:max-w-sm overflow-hidden p-2 group transition-all", isMe ? "border-emerald-500/30" : "border-white/10")}>
                        <div className="rounded-[1.8rem] overflow-hidden bg-black/30 group relative aspect-video flex items-center justify-center">
                          {msg.file.type.includes("image") ? (
                            <img src={msg.file.previewUrl} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-700" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-full object-cover" />
                          ) : (
                            <div className="p-10 flex flex-col items-center gap-4">
                              <FileIcon size={40} className="text-slate-800" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="p-4 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black text-white truncate leading-tight tracking-tight">{msg.file.name}</p>
                            <p className="text-[9px] text-emerald-500/60 font-black mt-1 uppercase">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => downloadFile(msg.file)} className="w-12 h-12 bg-white text-black rounded-2xl hover:bg-slate-100 transition-all flex items-center justify-center shadow-lg active:scale-90"><Download size={18} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-6 py-4 shadow-xl text-[15px] font-bold tracking-tight transition-all ring-1", isMe ? "bg-emerald-600/90 text-white rounded-[1.8rem] rounded-tr-none ring-emerald-400/20" : "bg-slate-900/50 backdrop-blur-sm border border-white/5 text-slate-200 rounded-[1.8rem] rounded-tl-none ring-white/5")}>
                        {msg.text}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 px-4 opacity-30">
                      <span className="text-[8px] text-slate-500 font-black uppercase italic">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && <Check size={8} className="text-emerald-500" />}
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-4 sm:p-8 bg-[#030508]/60 backdrop-blur-2xl border-t border-white/10 shrink-0 shadow-2xl">
            <div className="max-w-4xl mx-auto flex gap-3 sm:gap-4 items-center">
              <div className="flex gap-2 shrink-0">
                <button onClick={() => fileInputRef.current?.click()} className="w-13 h-13 flex items-center justify-center bg-white/5 text-slate-600 hover:text-emerald-400 rounded-xl transition-all border border-white/5 shadow-inner group">
                  <Paperclip size={20} className="group-hover:rotate-45 transition-transform" />
                </button>
                <button onClick={() => folderInputRef.current?.click()} className="w-13 h-13 flex items-center justify-center bg-white/5 text-slate-600 hover:text-emerald-400 rounded-xl transition-all border border-white/5 shadow-inner group">
                  <FolderOpen size={20} className="group-hover:translate-y-[-1px] transition-transform" />
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

              <div className="flex-1 flex items-center bg-black/40 border border-white/5 rounded-2xl px-6 py-4 shadow-inner ring-1 ring-white/5 focus-within:ring-emerald-500/20 transition-all">
                <textarea
                  rows={1} placeholder="Send a message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-transparent border-none outline-none text-[14px] text-white transition-all resize-none max-h-32 font-bold placeholder:text-slate-800"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-14 h-14 shrink-0 flex items-center justify-center bg-emerald-600 text-white rounded-2xl transition-all disabled:opacity-20 active:scale-95 border border-emerald-400/20 shadow-lg shadow-emerald-900/20 group grayscale-[0.5] hover:grayscale-0"
              >
                <Send size={22} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/98 backdrop-blur-3xl flex items-center justify-center p-6">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-10 right-10 text-slate-500 hover:text-white transition-all bg-white/5 p-4 rounded-xl border border-white/10 shadow-2xl"><X size={30} /></button>
            <motion.img initial={{ scale: 0.95 }} animate={{ scale: 1 }} src={fullPreviewUrl} alt="Visual focus" className="max-w-full max-h-[90vh] object-contain rounded-3xl shadow-3xl border border-white/10" />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.1); }
        .message-text { word-break: break-all; white-space: pre-wrap; }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
