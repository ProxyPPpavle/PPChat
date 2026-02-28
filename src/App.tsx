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
  Activity,
  Sparkles
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

  // Handle ExoClick Ad delivery
  useEffect(() => {
    if (isConnected) {
      try {
        // @ts-ignore
        (window.AdProvider = window.AdProvider || []).push({ "serve": {} });
      } catch (e) {
        console.error("Ad error", e);
      }
    }
  }, [isConnected]);

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
      conn.on("close", () => {
        setConnections(prev => prev.filter(c => c.peer !== conn.peer));
        if (!isHost) window.location.reload();
      });
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
        conn.on("close", () => window.location.reload());
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
    if (type.includes("image")) return <ImageIcon size={18} className="text-emerald-400" />;
    if (type.includes("video")) return <VideoIcon size={18} className="text-teal-400" />;
    return <FileIcon size={18} className="text-slate-500" />;
  };

  const BgEffect = () => (
    <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
      <div className="absolute top-[-10%] left-[10%] w-[800px] h-[800px] bg-[#004d40]/20 blur-[150px] rounded-full" />
      <div className="absolute bottom-[0%] right-[5%] w-[600px] h-[600px] bg-[#002b36]/30 blur-[130px] rounded-full" />
      <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-emerald-900/10 blur-[120px] rounded-full" />

      {/* Matrix-like subtle grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(16,185,129,0.03)_1.5px,transparent_1.5px)] bg-[size:50px_50px]" />
      <div className="absolute inset-0 bg-gradient-to-tr from-black via-transparent to-black opacity-80" />
    </div>
  );

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#05080a] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <BgEffect />
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm z-10">
          <div className="bg-[#0c1218]/80 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] border-[3px] border-slate-800 p-8 sm:p-9 relative overflow-hidden">
            <div className="flex flex-col items-center mb-9">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-2xl mb-5 border-2 border-emerald-500/20">
                <MessagesSquare className="text-black w-7 h-7" />
              </div>
              <h1 className="text-2xl font-black text-white tracking-widest uppercase">PPChat</h1>
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.5em] mt-2">P2P Communication</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Identity</label>
                <input
                  type="text" placeholder="Callsign..." value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/60 border-[3px] border-slate-700/50 rounded-2xl py-4 px-6 outline-none text-white text-base font-bold focus:border-emerald-500/50 transition-all shadow-xl placeholder:text-slate-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Room Code</label>
                <input
                  type="text" placeholder="Protocol..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-black/60 border-[3px] border-slate-700/50 rounded-2xl py-4 px-6 outline-none text-white text-base font-bold focus:border-emerald-500/50 transition-all shadow-xl placeholder:text-slate-800"
                />
              </div>
              {error && <div className="text-rose-400 text-[10px] font-black bg-rose-500/10 px-4 py-3 rounded-xl border-2 border-rose-500/20 flex items-center gap-3"><AlertCircle size={14} /> {error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleJoinOrCreate("host")} className="bg-white text-black py-4.5 rounded-[1.8rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 hover:bg-slate-100 transition-all shadow-2xl border-b-4 border-slate-300 active:translate-y-1 active:border-b-0"><Share2 size={18} /><span>Host</span></button>
                <button onClick={() => handleJoinOrCreate("join")} className="bg-emerald-600 text-white py-4.5 rounded-[1.8rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 hover:bg-emerald-500 transition-all shadow-2xl border-b-4 border-emerald-800 active:translate-y-1 active:border-b-0"><ChevronRight size={22} /><span>Join</span></button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#05080a] text-slate-400 flex flex-col font-sans overflow-hidden">
      <BgEffect />
      <header className="bg-[#0c1218]/90 backdrop-blur-2xl border-b-[3px] border-emerald-500/20 px-4 sm:px-10 py-5 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-2xl border-2 border-emerald-500/20">
            <MessagesSquare className="text-black w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <h2 className="font-black text-white text-xl truncate tracking-tighter">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-500 hover:text-emerald-400 transition-colors bg-white/5 rounded-lg border-2 border-slate-800 p-2"><Check size={14} className={copied ? "text-emerald-400" : "hidden"} /><Copy size={14} className={copied ? "hidden" : ""} /></button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)] animate-pulse" />
              <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.3em]">Active</p>
            </div>
          </div>
        </div>
        <div className="flex-1 max-w-sm mx-10 hidden lg:flex items-center gap-4 bg-black/60 border-[3px] border-slate-800 rounded-2xl px-5 py-3 focus-within:border-emerald-500/50 transition-all">
          <User size={16} className="text-emerald-500/60" />
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-transparent border-none outline-none text-white text-[13px] font-black placeholder:text-slate-800" placeholder="Identity..." />
        </div>
        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="text-slate-500 hover:text-rose-400 p-3 bg-white/5 rounded-2xl border-[3px] border-slate-800"><LogOut size={22} /></button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="hidden lg:flex w-85 border-r-[3px] border-slate-800 bg-[#0c1218]/40 flex-col backdrop-blur-md">
          <div className="p-6 border-b-[3px] border-slate-800 flex items-center justify-between bg-black/40">
            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-300">Vault</h3>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg border-2 border-emerald-500/30 font-black tracking-widest uppercase tracking-normal">P2P</span>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {messages.filter(m => m.file).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-10 text-center grayscale p-10"><ShieldCheck size={48} className="mb-4" /><p className="text-[10px] font-black uppercase tracking-[0.3em] tracking-normal">Vault Empty</p></div>
            ) : (
              messages.filter(m => m.file).map((msg) => (
                <div key={msg.id} className="bg-black/50 p-5 rounded-[2.5rem] border-[3px] border-slate-800 flex flex-col gap-4 group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center border-2 border-emerald-500/40">{getFileIcon(msg.file!.type)}</div>
                    <div className="flex-1 min-w-0"><p className="text-xs font-black truncate text-white">{msg.file?.name}</p><p className="text-[10px] text-emerald-500/50 uppercase font-black tracking-widest truncate mt-1">{msg.sender}</p></div>
                  </div>
                  <button onClick={() => downloadFile(msg.file)} className="w-full bg-emerald-600 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] border-b-4 border-emerald-800 hover:bg-emerald-500 active:translate-y-1 active:border-b-0">Download</button>
                </div>
              ))
            )}
            {/* ExoClick Ad Widget */}
            <div className="mt-10 border-[3px] border-slate-800 rounded-[2rem] overflow-hidden bg-black/40 flex justify-center p-2 min-h-[100px]">
              <ins className="eas6a97888e6" data-zoneid="5861218" data-ex_av="name"></ins>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-transparent overflow-hidden border-l-[3px] border-slate-800">
          <div className="flex-1 overflow-y-auto p-4 sm:p-12 space-y-10 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto space-y-10">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-15 mt-24 grayscale">
                  <MessageCircle size={64} className="mb-6 text-emerald-500" />
                  <h2 className="text-2xl font-black uppercase tracking-normal text-white">Encrypted Node</h2>
                </div>
              )}
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-10"><span className="text-[10px] font-black uppercase tracking-[0.5em] px-10 py-3 rounded-2xl bg-[#0b101b] text-emerald-500 border-[3px] border-emerald-500/20 shadow-3xl flex items-center gap-4"><Zap size={14} className="animate-pulse" /> {msg.text}</span></div>
                );
                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";
                return (
                  <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} key={msg.id} className={cn("flex flex-col w-full", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-600 mb-3 px-6">{msg.sender}</span>}
                    {msg.file && !msg.text ? (
                      <div className={cn("bg-[#0b101b] border-[3px] rounded-[3rem] shadow-2xl max-w-[90%] sm:max-w-md overflow-hidden p-3 group transition-all", isMe ? "border-emerald-500/40" : "border-slate-800")}>
                        <div className="rounded-[2.4rem] overflow-hidden bg-black/50 group relative aspect-video flex items-center justify-center border-2 border-white/5">
                          {msg.file.type.includes("image") ? (<img src={msg.file.previewUrl} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-1000" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                          ) : msg.file.type.includes("video") ? (<video src={msg.file.previewUrl} controls className="w-full h-full object-cover" />
                          ) : (<div className="p-12 flex flex-col items-center gap-6"><FileIcon size={56} className="text-slate-800" /></div>)}
                          <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="p-6 flex items-center justify-between gap-6">
                          <div className="flex-1 min-w-0"><p className="text-sm font-black text-white truncate leading-tight tracking-tight">{msg.file.name}</p><p className="text-[11px] text-emerald-500 font-black mt-2 uppercase opacity-80">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p></div>
                          <button onClick={() => downloadFile(msg.file)} className="w-14 h-14 bg-white text-black rounded-[1.3rem] hover:bg-emerald-50 transition-all flex items-center justify-center shadow-2xl active:scale-90 border-2 border-slate-300"><Download size={22} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-6 py-3.5 shadow-2xl text-[15px] font-bold tracking-tight border-[3px] relative overflow-hidden",
                        isMe ? "bg-emerald-600 text-white rounded-[2.2rem] rounded-tr-none border-emerald-400/40" : "bg-white text-black rounded-[2.2rem] rounded-tl-none border-slate-300")}>
                        {isMe && <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 blur-3xl" />}
                        <span className="relative z-10">{msg.text}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 px-6 opacity-30"><span className="text-[9px] text-slate-600 font-black uppercase italic">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{isMe && <Check size={12} className="text-emerald-500" />}</div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-4 sm:p-10 bg-[#0c1218]/95 backdrop-blur-3xl border-t-[3px] border-slate-800 shrink-0 shadow-[0_-40px_100px_rgba(0,0,0,0.9)]">
            <div className="max-w-4xl mx-auto flex gap-3 sm:gap-6 items-center">
              <div className="flex gap-2 sm:gap-4 shrink-0">
                <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 rounded-2xl transition-all border-b-4 border-emerald-800 shadow-xl active:translate-y-1 active:border-b-0"><Paperclip size={18} className="sm:size-22" /></button>
                <button onClick={() => folderInputRef.current?.click()} className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 rounded-2xl transition-all border-b-4 border-emerald-800 shadow-xl active:translate-y-1 active:border-b-0"><FolderOpen size={18} className="sm:size-22" /></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} {...{ webkitdirectory: "", directory: "" } as any} className="hidden" />
              <div className="flex-1 flex items-center bg-black/60 border-[3px] border-slate-700/50 rounded-[2rem] px-5 sm:px-8 py-3.5 sm:py-5 shadow-inner focus-within:border-emerald-500/60 transition-all"><textarea rows={1} placeholder="Protocol Input..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} className="w-full bg-transparent border-none outline-none text-[15px] sm:text-[16px] text-white transition-all resize-none max-h-40 font-bold placeholder:text-slate-800" /></div>
              <button onClick={sendMessage} disabled={!inputText.trim()} className="w-14 h-14 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center bg-emerald-600 text-white rounded-[2rem] transition-all disabled:opacity-20 border-b-4 border-emerald-900 shadow-2xl hover:bg-emerald-500 active:translate-y-1 active:border-b-0"><Send size={24} className="sm:size-28" /></button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#030508]/98 backdrop-blur-3xl flex items-center justify-center p-8">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-12 right-12 text-slate-500 hover:text-white bg-white/5 p-5 rounded-2xl border-2 border-slate-800 shadow-2xl"><X size={36} /></button>
            <motion.div initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }}><img src={fullPreviewUrl} alt="Visual focus" className="max-w-full max-h-[85vh] object-contain rounded-[3rem] shadow-3xl border-[3px] border-slate-800" /></motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.2); }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
