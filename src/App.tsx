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
    previewUrl?: string; // This is generated locally on EACH device
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

  // Handle local preview URL generation for received/sent files
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
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data], { type });
    if (typeof data === "string" && data.startsWith("data:")) {
      const parts = data.split(",");
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new Blob([u8arr], { type: parts[0].split(":")[1].split(";")[0] });
    }
    // Handle PeerJS chunk objects if they appear
    if (data && typeof data === 'object' && !data.constructor.name.includes('Array')) {
      try { return new Blob([data], { type }); } catch (e) { return null; }
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
    // CRITICAL: Clean the incoming message's previewUrl before adding, 
    // because blob URLs from OTHER devices won't work here.
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
            text: `${username.trim() || "Anonymous"} joined the protocol`,
            timestamp: Date.now(),
            type: "system"
          });
        });
        conn.on("data", (data) => handleReceivedData(data, conn));
        conn.on("error", () => { setError("Host not found."); setIsConnecting(false); });
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

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon size={22} className="text-blue-500" />;
    if (type.includes("video")) return <VideoIcon size={22} className="text-indigo-500" />;
    return <FileIcon size={22} className="text-slate-400" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Modern Background Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10">
          <div className="bg-white rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-white/50 p-10">
            <div className="flex flex-col items-center mb-12">
              <div className="w-28 h-28 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl mb-6 p-3 border border-slate-100">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
              </div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight italic">PPChat</h1>
              <p className="text-[11px] font-black text-blue-600 uppercase tracking-[0.4em] mt-2">Zero-Trace Comm</p>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Identity</label>
                <div className="relative group">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input
                    type="text" placeholder="Your name..." value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-14 pr-6 outline-none text-slate-700 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Protocol Name</label>
                <div className="relative group">
                  <Plus className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input
                    type="text" placeholder="e.g. shadow-net" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-14 pr-6 outline-none text-slate-700 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all shadow-inner"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-500 text-[11px] font-black bg-rose-50 p-4 rounded-2xl border border-rose-100 flex items-center gap-3 animate-head-shake">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-5 pt-4">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-slate-900 text-white h-32 rounded-[2.5rem] font-black flex flex-col items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 shadow-2xl shadow-slate-300 group"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin" /> : <><Share2 size={32} className="group-hover:scale-110 transition-transform" /><span className="text-xs uppercase tracking-widest">Host</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-blue-600 text-white h-32 rounded-[2.5rem] font-black flex flex-col items-center justify-center gap-3 hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-50 shadow-2xl shadow-blue-200 group"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin" /> : <><ChevronRight size={36} className="group-hover:translate-x-1 transition-transform" /><span className="text-xs uppercase tracking-widest">Join</span></>}
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
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-4 sm:px-8 py-5 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-2xl p-1.5 border border-slate-100 shrink-0">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-slate-900 text-lg tracking-tight leading-none">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-400 hover:text-blue-500 transition-colors p-1">
                {copied ? <Check size={16} className="text-blue-500" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                {isHost ? `Broadcasting (${connections.length})` : "Encrypted Node"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-sm mx-10 hidden lg:flex items-center gap-4 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/50">
          <User size={16} className="ml-3 text-slate-300" />
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="flex-1 bg-transparent border-none py-2 px-1 outline-none text-slate-700 text-xs font-black"
            placeholder="Identity..."
          />
        </div>

        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="flex items-center gap-2 text-slate-400 hover:text-rose-500 transition-all p-3 hover:bg-rose-50 rounded-2xl group">
          <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">Destroy</span>
          <LogOut size={22} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Archive Sidebar */}
        <div className="hidden lg:flex w-80 border-r border-slate-200/60 bg-white flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Memory Bank</h3>
            <FileIcon size={14} className="text-slate-300" />
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {messages.filter(m => m.file).map((msg) => (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={msg.id} className="bg-slate-50/80 p-4 rounded-[2rem] border border-slate-200/50 flex flex-col gap-4 group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-slate-100">{getFileIcon(msg.file!.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black truncate text-slate-800">{msg.file?.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1 tracking-tight">{msg.sender}</p>
                  </div>
                </div>
                <button onClick={() => downloadFile(msg.file)} className="w-full bg-blue-600 text-white h-12 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-100">Fetch File</button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-slate-50/30 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white to-transparent pointer-events-none z-10 opacity-60" />

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar relative">
            <div className="max-w-4xl mx-auto space-y-8">
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-8">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] px-5 py-2 rounded-full bg-white shadow-sm text-slate-400 border border-slate-100">{msg.text}</span>
                  </div>
                );

                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";

                return (
                  <div key={msg.id} className={cn("flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-500", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 px-2">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className={cn("bg-white border rounded-[2.5rem] shadow-2xl max-w-[85%] sm:max-w-sm overflow-hidden p-2 group transition-all hover:border-blue-200", isMe ? "border-blue-100" : "border-slate-200")}>
                        <div className="rounded-[2.2rem] overflow-hidden bg-slate-50 relative group">
                          {msg.file.type.includes("image") ? (
                            <>
                              <img src={msg.file.previewUrl} className="w-full h-auto max-h-80 object-cover cursor-pointer hover:scale-105 transition-transform duration-700" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <Maximize2 className="text-white" size={32} />
                              </div>
                            </>
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-auto max-h-80" />
                          ) : (
                            <div className="p-14 flex flex-col items-center justify-center gap-4">
                              <FileIcon size={56} strokeWidth={1.5} className="text-slate-300" />
                              {msg.file.folderPath && <span className="text-[9px] font-black bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-full tracking-widest">DIR: {msg.file.folderPath.split('/')[0]}</span>}
                            </div>
                          )}
                        </div>
                        <div className="p-5 flex items-center justify-between gap-5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-slate-800 truncate">{msg.file.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-black mt-1.5 tracking-tighter">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => downloadFile(msg.file)} className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center hover:bg-blue-500 transition-all shadow-xl shadow-blue-200"><Download size={24} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-7 py-5 shadow-2xl text-[16px] leading-relaxed font-bold tracking-tight transition-all", isMe ? "bg-blue-600 text-white rounded-[2.2rem] rounded-tr-none max-w-[85%] sm:max-w-[75%] shadow-blue-200" : "bg-white border border-slate-100 text-slate-800 rounded-[2.2rem] rounded-tl-none max-w-[85%] sm:max-w-[75%]")}>
                        {msg.text}
                      </div>
                    )}
                    <span className="text-[10px] text-slate-300 font-black mt-3 px-3 uppercase tracking-widest italic">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-4 sm:p-8 bg-white border-t border-slate-200/60 shadow-[0_-20px_40px_rgba(0,0,0,0.03)]">
            <div className="max-w-4xl mx-auto flex gap-4 sm:gap-6 items-end">
              <div className="flex gap-2.5 pb-2">
                <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-blue-500 rounded-2xl transition-all border border-slate-200/50 shadow-inner group" title="Add Files"><Paperclip size={24} className="group-hover:rotate-12 transition-transform" /></button>
                <button onClick={() => folderInputRef.current?.click()} className="w-14 h-14 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-blue-500 rounded-2xl transition-all border border-slate-200/50 shadow-inner group" title="Add Folder"><FolderOpen size={24} className="group-hover:scale-110 transition-transform" /></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} webkitdirectory="" directory="" className="hidden" />

              <div className="flex-1 relative pb-1">
                <textarea
                  rows={1} placeholder="Protocol message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-[1.8rem] px-7 py-5 outline-none text-[16px] text-slate-800 transition-all resize-none shadow-inner focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/20 max-h-40 font-bold"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-16 h-16 mb-1.5 flex items-center justify-center bg-blue-600 text-white rounded-[1.8rem] hover:bg-slate-900 transition-all disabled:opacity-30 active:scale-90 shadow-2xl shadow-blue-200 group"
              >
                <Send size={28} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-2xl flex items-center justify-center p-4">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-8 right-8 text-white/50 hover:text-white transition-all bg-white/10 p-4 rounded-full"><X size={36} /></button>
            <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} src={fullPreviewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-3xl shadow-[0_0_100px_rgba(59,130,246,0.3)] border border-white/10" />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .message-text { word-break: break-all; white-space: pre-wrap; }
        textarea::-webkit-scrollbar { display: none; }
        @keyframes head-shake {
           0% { transform: translateX(0); }
           25% { transform: translateX(-4px); }
           50% { transform: translateX(4px); }
           75% { transform: translateX(-4px); }
           100% { transform: translateX(0); }
        }
        .animate-head-shake { animation: head-shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}

declare module "react" {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> { webkitdirectory?: string; directory?: string; }
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
