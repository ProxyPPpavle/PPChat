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
    if (type.includes("image")) return <ImageIcon size={22} className="text-blue-400" />;
    if (type.includes("video")) return <VideoIcon size={22} className="text-indigo-400" />;
    return <FileIcon size={22} className="text-slate-500" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#050810] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Dynamic Background Glows */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[140px] animate-pulse" style={{ animationDelay: '2s' }} />

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm z-10">
          <div className="bg-slate-900/60 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-white/5 p-8 relative overflow-hidden">
            {/* Subtle internal glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -z-10" />

            <div className="flex flex-col items-center mb-8 relative">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-[0_10px_40px_rgba(255,255,255,0.1)] mb-4 p-2.5 border border-white/10 group">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain group-hover:scale-110 transition-transform" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight italic">PPChat</h1>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.4em] mt-1.5 opacity-80">Dark Protocol v2</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Identity</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                  <input
                    type="text" placeholder="Callsign..." value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 outline-none text-white text-sm font-bold focus:border-blue-500/30 transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Protocol Room</label>
                <div className="relative group">
                  <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                  <input
                    type="text" placeholder="Connect code..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 outline-none text-white text-sm font-bold focus:border-blue-500/30 transition-all shadow-inner"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-400 text-[10px] font-black bg-rose-500/10 p-4 rounded-2xl border border-rose-500/10 flex items-center gap-3 animate-pulse">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-white/5 text-white border border-white/10 py-6 rounded-3xl font-black flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50 group shadow-lg"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin" /> : <><Share2 size={24} className="group-hover:text-blue-400 transition-colors" /><span className="text-[10px] uppercase tracking-[0.2em]">Initialise</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-blue-600 text-white py-6 rounded-3xl font-black flex flex-col items-center justify-center gap-2 hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-50 shadow-[0_10px_30px_rgba(37,99,235,0.3)] border border-blue-500/20 group"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin text-white" /> : <><ChevronRight size={30} className="group-hover:translate-x-1 transition-transform" /><span className="text-[10px] uppercase tracking-[0.2em]">Synchronise</span></>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050810] text-slate-300 flex flex-col font-sans overflow-hidden font-medium">
      <header className="bg-slate-900/60 backdrop-blur-2xl border-b border-white/5 px-4 sm:px-8 py-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.05)] p-1.5 border border-white/10 shrink-0">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="font-black text-white text-base truncate tracking-tight">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-500 hover:text-blue-400 transition-colors shrink-0 p-1">
                {copied ? <Check size={16} className="text-blue-400" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">
                {isHost ? `Protocol Broadcaster` : "Peer Instance Active"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-sm mx-8 hidden lg:flex items-center gap-3 bg-black/40 border border-white/5 rounded-2xl px-4 py-2.5">
          <User size={14} className="text-slate-600" />
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-white text-xs font-black placeholder:text-slate-600"
            placeholder="Agent callsing..."
          />
        </div>

        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="text-slate-600 hover:text-rose-500 transition-all p-2.5 hover:bg-rose-500/10 rounded-2xl border border-transparent hover:border-rose-500/20">
          <LogOut size={22} />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Vault */}
        <div className="hidden lg:flex w-80 border-r border-white/5 bg-slate-900/30 flex-col relative overflow-hidden">
          <div className="p-5 border-b border-white/5 flex items-center justify-between bg-black/20">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Asset Vault</h3>
            <div className="w-2 h-2 rounded-full bg-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.filter(m => m.file).map((msg) => (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={msg.id} className="bg-black/40 p-4 rounded-3xl border border-white/5 flex flex-col gap-4 group hover:border-blue-500/20 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-800/50 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 shadow-inner">{getFileIcon(msg.file!.type)}</div>
                  <div className="flex-1 min-w-0 pr-1">
                    <p className="text-[11px] font-black truncate text-white">{msg.file?.name}</p>
                    <p className="text-[9px] text-slate-500 uppercase font-black mt-1 tracking-widest">{msg.sender}</p>
                  </div>
                </div>
                <button onClick={() => downloadFile(msg.file)} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-blue-600/20">Fetch Asset</button>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#050810] overflow-hidden relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/[0.03] rounded-full blur-[160px] pointer-events-none -z-10" />

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto space-y-8">
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-6">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] px-6 py-2 rounded-full bg-black/40 text-slate-500 border border-white/5 shadow-2xl backdrop-blur-md">{msg.text}</span>
                  </div>
                );

                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";

                return (
                  <div key={msg.id} className={cn("flex flex-col w-full animate-in fade-in slide-in-from-bottom-6 duration-500", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[11px] font-black uppercase tracking-widest text-slate-600 mb-2.5 px-3 block">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className={cn("bg-slate-900 border rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-w-[85%] sm:max-w-sm overflow-hidden p-2 group transition-all", isMe ? "border-blue-500/20" : "border-white/5")}>
                        <div className="rounded-[2.2rem] overflow-hidden bg-black/30 group relative aspect-video flex items-center justify-center">
                          {msg.file.type.includes("image") ? (
                            <img src={msg.file.previewUrl} className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-700" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-full object-cover" />
                          ) : (
                            <div className="p-10 flex flex-col items-center justify-center gap-4">
                              <FileIcon size={48} className="text-slate-800" />
                              {msg.file.folderPath && <span className="text-[9px] font-black bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full shadow-inner border border-blue-500/10">PROTOCOL DIR: {msg.file.folderPath.split('/')[0]}</span>}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                        </div>
                        <div className="p-5 flex items-center justify-between gap-5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-white truncate leading-tight tracking-tight">{msg.file.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-black mt-2 tracking-tighter">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => downloadFile(msg.file)} className="w-14 h-14 bg-blue-600 text-white rounded-[1.4rem] hover:bg-blue-500 transition-all flex items-center justify-center shadow-lg shadow-blue-600/30 border border-blue-400/20"><Download size={22} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-7 py-5 shadow-2xl text-[16px] leading-relaxed font-bold tracking-tight transition-all", isMe ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-[2.2rem] rounded-tr-none shadow-blue-600/20" : "bg-slate-900 border border-white/5 text-slate-200 rounded-[2.2rem] rounded-tl-none")}>
                        {msg.text}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3 px-3">
                      <span className="text-[9px] text-slate-700 font-black uppercase tracking-tighter italic">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && <Check size={10} className="text-blue-500/60" />}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-4 sm:p-8 bg-slate-900/60 backdrop-blur-3xl border-t border-white/5 shrink-0 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
            <div className="max-w-4xl mx-auto flex gap-3 sm:gap-5 items-center">
              <div className="flex gap-2.5 shrink-0">
                <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 flex items-center justify-center bg-black/40 text-slate-500 hover:text-blue-400 rounded-2xl transition-all border border-white/5 shadow-inner hover:bg-black/60"><Paperclip size={22} /></button>
                <button onClick={() => folderInputRef.current?.click()} className="w-14 h-14 flex items-center justify-center bg-black/40 text-slate-500 hover:text-blue-400 rounded-2xl transition-all border border-white/5 shadow-inner hover:bg-black/60"><FolderOpen size={22} /></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} webkitdirectory="" directory="" className="hidden" />

              <div className="flex-1 flex items-center bg-black/40 border border-white/5 rounded-3xl px-6 py-4 shadow-inner group-focus-within:border-blue-500/20 transition-all">
                <textarea
                  rows={1} placeholder="Protocol input..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-transparent border-none outline-none text-[15px] text-white transition-all resize-none max-h-32 font-bold placeholder:text-slate-600"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-16 h-16 shrink-0 flex items-center justify-center bg-blue-600 text-white rounded-[1.6rem] hover:bg-blue-500 transition-all disabled:opacity-30 active:scale-95 shadow-[0_10px_30px_rgba(37,99,235,0.4)] border border-blue-400/20"
              >
                <Send size={26} />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#050810]/95 backdrop-blur-3xl flex items-center justify-center p-4">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-all bg-white/5 p-4 rounded-full border border-white/10"><X size={32} /></button>
            <motion.img initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} src={fullPreviewUrl} alt="Visual focus" className="max-w-full max-h-full object-contain rounded-3xl shadow-[0_0_120px_rgba(37,99,235,0.2)] border border-white/10" />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
        .message-text { word-break: break-all; white-space: pre-wrap; }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      input: React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement> & { webkitdirectory?: string; directory?: string }, HTMLInputElement>;
    }
  }
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
