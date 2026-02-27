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

  // Handle local preview URL generation
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
      setError(err.type === "unavailable-id" ? "Room name busy." : `Error: ${err.type}`);
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
            text: `${username.trim() || "Anonymous"} joined`,
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

  const copyRoomName = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon size={22} className="text-blue-500" />;
    if (type.includes("video")) return <VideoIcon size={22} className="text-blue-600" />;
    return <FileIcon size={22} className="text-slate-400" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[100px]" />

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm z-10">
          <div className="bg-white rounded-[2.5rem] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.1)] border border-slate-100 p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-4 p-2 border border-slate-100">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight italic">PPChat</h1>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mt-1">Direct Secure</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Identity</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500" size={18} />
                  <input
                    type="text" placeholder="Name..." value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 text-sm font-bold focus:border-blue-500/30 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Room Name</label>
                <div className="relative group">
                  <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500" size={18} />
                  <input
                    type="text" placeholder="Room..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 text-sm font-bold focus:border-blue-500/30 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-500 text-[10px] font-black bg-rose-50 p-3 rounded-xl border border-rose-100 flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-slate-900 text-white py-6 rounded-3xl font-black flex flex-col items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 shadow-lg"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin" /> : <><Share2 size={24} /><span className="text-[10px] uppercase tracking-widest">Host</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-blue-600 text-white py-6 rounded-3xl font-black flex flex-col items-center justify-center gap-2 hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-100"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin text-white" /> : <><ChevronRight size={30} /><span className="text-[10px] uppercase tracking-widest">Join</span></>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white text-slate-700 flex flex-col font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-100 px-4 sm:px-8 py-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-md p-1 border border-slate-100 shrink-0">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-slate-900 text-base truncate">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-400 hover:text-blue-500 transition-colors shrink-0">
                {copied ? <Check size={16} className="text-blue-500" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                {isHost ? `Active` : "Direct P2P"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-sm mx-6 hidden lg:flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
          <User size={14} className="text-slate-300" />
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-slate-700 text-xs font-black"
            placeholder="Name..."
          />
        </div>

        <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="text-slate-400 hover:text-rose-500 transition-all p-2 hover:bg-rose-50 rounded-xl">
          <LogOut size={22} />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="hidden lg:flex w-72 border-r border-slate-100 bg-white flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vault</h3>
            <FileIcon size={14} className="text-slate-300" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.filter(m => m.file).map((msg) => (
              <div key={msg.id} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">{getFileIcon(msg.file!.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black truncate text-slate-800">{msg.file?.name}</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold mt-0.5">{msg.sender}</p>
                  </div>
                </div>
                <button onClick={() => downloadFile(msg.file)} className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-md shadow-blue-50">Fetch</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-6">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full bg-slate-50 text-slate-400 border border-slate-100">{msg.text}</span>
                  </div>
                );
                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";
                return (
                  <div key={msg.id} className={cn("flex flex-col w-full animate-in fade-in slide-in-from-bottom-2 duration-500", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-2 px-2">{msg.sender}</span>}
                    {msg.file && !msg.text ? (
                      <div className={cn("bg-white border rounded-[2rem] shadow-sm max-w-sm overflow-hidden p-2", isMe ? "border-blue-100" : "border-slate-100")}>
                        <div className="rounded-[1.7rem] overflow-hidden bg-slate-50 group relative">
                          {msg.file.type.includes("image") ? (
                            <img src={msg.file.previewUrl} className="w-full h-auto max-h-72 object-cover cursor-pointer hover:scale-105 transition-transform duration-500" onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} />
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-auto max-h-72" />
                          ) : (
                            <div className="p-10 flex flex-col items-center justify-center gap-3">
                              <FileIcon size={48} className="text-slate-200" />
                              {msg.file.folderPath && <span className="text-[8px] font-black bg-slate-200 text-slate-500 px-2 py-1 rounded shadow-sm">DIR: {msg.file.folderPath.split('/')[0]}</span>}
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">{msg.file.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-black mt-1 tracking-tighter">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => downloadFile(msg.file)} className="w-12 h-12 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all flex items-center justify-center shadow-lg shadow-blue-50"><Download size={20} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-6 py-4 shadow-sm text-[15px] leading-relaxed font-bold", isMe ? "bg-blue-600 text-white rounded-[1.75rem] rounded-tr-none shadow-blue-50" : "bg-slate-50 border border-slate-100 text-slate-800 rounded-[1.75rem] rounded-tl-none")}>
                        {msg.text}
                      </div>
                    )}
                    <span className="text-[9px] text-slate-300 font-black mt-2 px-2 uppercase tracking-tighter">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-4 sm:p-6 bg-white border-t border-slate-100 shrink-0">
            <div className="max-w-4xl mx-auto flex gap-3 sm:gap-4 items-center">
              <div className="flex gap-2 shrink-0">
                <button onClick={() => fileInputRef.current?.click()} className="w-13 h-13 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-blue-500 rounded-2xl transition-all border border-slate-100"><Paperclip size={22} /></button>
                <button onClick={() => folderInputRef.current?.click()} className="w-13 h-13 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-blue-500 rounded-2xl transition-all border border-slate-100"><FolderOpen size={22} /></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} webkitdirectory="" directory="" className="hidden" />

              <div className="flex-1 flex items-center bg-slate-50 border border-slate-100 rounded-3xl px-5 py-3 shadow-inner">
                <textarea
                  rows={1} placeholder="Protocol message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-transparent border-none outline-none text-[15px] text-slate-800 transition-all resize-none max-h-32 font-bold"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-14 h-14 shrink-0 flex items-center justify-center bg-blue-600 text-white rounded-2xl hover:bg-slate-900 transition-all disabled:opacity-30 active:scale-95 shadow-xl shadow-blue-100"
              >
                <Send size={24} />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-3xl flex items-center justify-center p-4">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-all bg-white/10 p-3 rounded-full"><X size={32} /></button>
            <img src={fullPreviewUrl} alt="Full" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .w-13 { width: 3.25rem; }
        .h-13 { height: 3.25rem; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #f1f5f9; border-radius: 10px; }
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
