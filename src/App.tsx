import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Eye,
  Maximize2,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: string;
  sender: string;
  color?: string;
  text?: string;
  file?: {
    name: string;
    type: string;
    data: any;
    size?: number;
    previewUrl?: string; // Local Object URL for preview
    folderPath?: string; // Original folder path if uploaded as folder
  };
  timestamp: number;
  type?: "system";
  systemType?: "join" | "leave" | "error";
}

function getContrastColor(hexColor: string) {
  if (!hexColor) return "white";
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "black" : "white";
}

export default function App() {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [username, setUsername] = useState<string>(localStorage.getItem("ppchat-username") || "");
  const [userColor, setUserColor] = useState<string>(localStorage.getItem("ppchat-color") || "#3b82f6");
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
    localStorage.setItem("ppchat-color", userColor);
  }, [username, userColor]);

  // Cleanup Object URLs on unmount
  useEffect(() => {
    return () => {
      messages.forEach(msg => {
        if (msg.file?.previewUrl) URL.revokeObjectURL(msg.file.previewUrl);
      });
    };
  }, []);

  const addMessage = (msg: Message) => {
    // If it's a file, generate a preview URL locally
    if (msg.file && msg.file.data && !msg.file.previewUrl) {
      try {
        const blob = createBlob(msg.file.data, msg.file.type);
        if (blob) {
          msg.file.previewUrl = URL.createObjectURL(blob);
        }
      } catch (e) {
        console.error("Error creating preview URL", e);
      }
    }

    setMessages((prev) => {
      if (prev.find((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  };

  const createBlob = (data: any, type: string) => {
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      return new Blob([data], { type: type || 'application/octet-stream' });
    }
    if (typeof data === "string" && data.startsWith("data:")) {
      const parts = data.split(",");
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      return new Blob([ab], { type: mimeString });
    }
    // PeerJS sometimes sends data indexed by number (chunks)
    if (data && typeof data === 'object') {
      try { return new Blob([data], { type: type || 'application/octet-stream' }); } catch (e) { return null; }
    }
    return null;
  };

  const broadcast = (msg: Message, excludeConns: DataConnection[] = []) => {
    connections.forEach((conn) => {
      if (!excludeConns.some(e => e.peer === conn.peer)) {
        conn.send(msg);
      }
    });
  };

  const handleReceivedData = (data: any, fromConn: DataConnection) => {
    console.log("Received data:", data);
    const msg = data as Message;
    addMessage(msg);

    if (isHost) {
      setConnections(prev => {
        prev.forEach(conn => {
          if (conn.peer !== fromConn.peer) conn.send(msg);
        });
        return prev;
      });
    }
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
        setConnections((prev) => [...prev, conn]);
        addMessage({
          id: `sys-${Date.now()}-${Math.random()}`,
          sender: "System",
          text: `A peer connected`,
          timestamp: Date.now(),
          type: "system",
          systemType: "join",
        });
      });
      conn.on("data", (data: any) => handleReceivedData(data, conn));
      conn.on("close", () => setConnections((prev) => prev.filter((c) => c.peer !== conn.peer)));
    });

    newPeer.on("error", (err) => {
      setIsConnecting(false);
      setError(err.type === "unavailable-id" ? "Room name busy." : `Peer error: ${err.type}`);
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
          const joinMsg = {
            id: `sys-join-${Date.now()}`,
            sender: username.trim() || "Anonymous",
            text: `${username.trim() || "Anonymous"} joined`,
            timestamp: Date.now(),
            type: "system",
            systemType: "join" as const,
          };
          conn.send(joinMsg);
        });
        conn.on("data", (data) => handleReceivedData(data, conn));
        conn.on("error", () => { setError("Could not find room."); setIsConnecting(false); });
      });
    }
  };

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !peer) return;

    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: username.trim() || "Anonymous",
      color: userColor,
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
        color: userColor,
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
    if (!blob) { alert("Format not supported for direct download."); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLeaveRoom = () => { peer?.destroy(); window.location.reload(); };
  const copyRoomName = () => { navigator.clipboard.writeText(roomName); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon size={20} className="text-blue-400" />;
    if (type.includes("video")) return <VideoIcon size={20} className="text-purple-400" />;
    return <FileIcon size={20} className="text-amber-400" />;
  };

  const formatFileSize = (bytes: number = 0) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#050810] text-slate-200 flex flex-col items-center justify-center p-6 font-sans overflow-hidden relative">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[160px] animate-pulse" />

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm z-10">
          <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] p-8 overflow-hidden relative">
            <div className="flex flex-col items-center mb-10 text-center">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-4 p-2">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
              </div>
              <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent italic">PPChat</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mt-2">Zero-Server Gateway</p>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Identity</label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={16} />
                    <input
                      type="text" placeholder="Callsign..." value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl py-3.5 pl-10 pr-4 outline-none text-white text-sm focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium"
                    />
                  </div>
                </div>
                <div className="w-16 space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Vibe</label>
                  <div className="relative h-[48px] rounded-2xl overflow-hidden border border-white/5">
                    <input
                      type="color" value={userColor} onChange={(e) => setUserColor(e.target.value)}
                      className="absolute inset-[-10px] w-[150%] h-[150%] cursor-pointer bg-transparent border-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Target Room</label>
                <div className="relative group">
                  <Plus className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={16} />
                  <input
                    type="text" placeholder="Protocol Name..." value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-3.5 pl-10 pr-4 outline-none text-white text-sm focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-400 text-[11px] font-bold bg-rose-500/5 p-3 rounded-xl border border-rose-500/10 flex items-center gap-2 animate-bounce">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10 py-5 rounded-3xl font-black flex flex-col items-center gap-2 transition-all active:scale-95 disabled:opacity-50 group"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin" /> : <><Share2 size={24} className="group-hover:text-blue-400 transition-colors" /><span className="text-[9px] uppercase tracking-widest">Host</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-3xl font-black flex flex-col items-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-600/20 group"
                >
                  {isConnecting ? <Loader2 size={24} className="animate-spin text-white" /> : <><ChevronRight size={28} className="group-hover:translate-x-1 transition-transform" /><span className="text-[9px] uppercase tracking-widest">Connect</span></>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050810] text-slate-200 flex flex-col font-sans overflow-hidden font-medium">
      <header className="bg-slate-900/40 backdrop-blur-2xl border-b border-white/5 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg p-1 shrink-0">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = "https://cdn-icons-png.flaticon.com/512/825/825590.png")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-white text-base leading-none tracking-tight">{currentRoom}</h2>
              <button
                onClick={copyRoomName}
                className="text-slate-500 hover:text-white transition-colors p-1"
                title="Copy Room Name"
              >
                {copied ? <Check size={14} className="text-blue-400" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">
                {isHost ? `Hosting Protocol (${connections.length})` : "Encrypted P2P Node"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-sm mx-10 hidden md:flex items-center gap-4 bg-black/20 p-1.5 rounded-2xl border border-white/5">
          <div className="relative flex-1 group">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={14} />
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent border-none py-2 pl-9 pr-3 outline-none text-white text-xs font-bold transition-all"
              placeholder="Your Callsign..."
            />
          </div>
          <div className="w-8 h-8 rounded-xl overflow-hidden border border-white/10 shrink-0 relative">
            <input
              type="color" value={userColor} onChange={(e) => setUserColor(e.target.value)}
              className="absolute inset-[-8px] w-[140%] h-[140%] cursor-pointer bg-transparent border-none"
            />
          </div>
        </div>

        <button onClick={handleLeaveRoom} className="flex items-center gap-2 text-slate-500 hover:text-rose-400 transition-all px-4 py-2 hover:bg-rose-500/10 rounded-xl group">
          <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">Terminate</span>
          <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="hidden lg:flex w-80 border-r border-white/5 bg-slate-900/20 flex-col">
          <div className="p-5 border-b border-white/5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center justify-between">
            <span>Archive</span>
            <FileIcon size={12} />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.filter(m => m.file).map((msg) => (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={msg.id} className="bg-slate-800/30 p-3 rounded-2xl border border-white/5 flex items-center gap-3 hover:bg-slate-800/80 transition-all group">
                <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center shrink-0 border border-white/5">{getFileIcon(msg.file!.type)}</div>
                <div className="flex-1 min-w-0 pr-1">
                  <p className="text-xs font-bold truncate text-slate-200">{msg.file?.name}</p>
                  <p className="text-[9px] text-slate-500 uppercase font-black tracking-tight mt-0.5">{formatFileSize(msg.file?.size)}</p>
                </div>
                <button
                  onClick={() => downloadFile(msg.file)}
                  className="w-8 h-8 flex items-center justify-center bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg transition-all"
                  title="Download"
                >
                  <Download size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#050810] relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/[0.02] rounded-full blur-[120px] pointer-events-none -z-10" />

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-8">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] px-5 py-2 rounded-full bg-slate-900/80 text-slate-500 border border-white/5 shadow-2xl">{msg.text}</span>
                  </div>
                );

                const isMe = msg.sender === (username.trim() || "Anonymous");
                const showSender = idx === 0 || messages[idx - 1].sender !== msg.sender || messages[idx - 1].type === "system";
                const bubbleColor = isMe ? userColor : (msg.color || "#1e293b");
                const textColor = getContrastColor(bubbleColor);

                return (
                  <div key={msg.id} className={cn("flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-500", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-2">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className={cn("flex flex-col gap-2 p-1.5 rounded-[2rem] border border-white/10 shadow-2xl max-w-sm group relative overflow-hidden", isMe ? "bg-slate-900/60 items-end" : "bg-slate-900/60 items-start")}>
                        {/* File Preview Content */}
                        <div className="w-full relative rounded-[1.5rem] overflow-hidden bg-black/20">
                          {msg.file.type.includes("image") ? (
                            <img
                              src={msg.file.previewUrl}
                              alt={msg.file.name}
                              className="w-full h-auto max-h-64 object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                              onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)}
                            />
                          ) : msg.file.type.includes("video") ? (
                            <video src={msg.file.previewUrl} controls className="w-full h-auto max-h-64" />
                          ) : (
                            <div className="p-8 flex flex-col items-center justify-center gap-3">
                              <FileIcon size={48} strokeWidth={1} className="text-slate-600" />
                              {msg.file.folderPath && <span className="text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md">FOLDER: {msg.file.folderPath.split('/')[0]}</span>}
                            </div>
                          )}
                        </div>

                        {/* File Details Bar */}
                        <div className="w-full p-4 flex items-center gap-4">
                          <div className="w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center shrink-0 border border-white/5">{getFileIcon(msg.file.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">{msg.file.name}</p>
                            <p className="text-[9px] text-slate-500 font-black uppercase mt-0.5 tracking-tight">{formatFileSize(msg.file.size)}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setFullPreviewUrl(msg.file?.previewUrl || null)} className="w-10 h-10 bg-white/5 text-slate-400 rounded-xl flex items-center justify-center hover:bg-white/10 transition-all"><Maximize2 size={16} /></button>
                            <button onClick={() => downloadFile(msg.file)} className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"><Download size={18} /></button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{ backgroundColor: bubbleColor, color: textColor }}
                        className={cn("px-6 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.3)] text-[15px] message-text leading-relaxed font-semibold transition-all hover:brightness-110", isMe ? "rounded-[2rem] rounded-tr-none" : "rounded-[2rem] rounded-tl-none")}
                      >
                        {msg.text}
                      </div>
                    )}
                    <span className="text-[9px] text-slate-700 font-black mt-2 px-2 uppercase tracking-tighter">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-6 border-t border-white/5 bg-slate-900/40 backdrop-blur-3xl">
            <div className="max-w-3xl mx-auto flex gap-4 items-end">
              <div className="flex gap-2 pb-1">
                <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-400 hover:text-blue-400 rounded-2xl transition-all border border-white/5 shadow-inner" title="Send Files"><Paperclip size={20} /></button>
                <button onClick={() => folderInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-400 hover:text-blue-400 rounded-2xl transition-all border border-white/5 shadow-inner" title="Send Folder"><FolderOpen size={20} /></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} webkitdirectory="" directory="" className="hidden" />

              <div className="flex-1 relative">
                <textarea
                  rows={1} placeholder="Command center message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="w-full bg-black/40 border border-white/5 rounded-[1.5rem] px-6 py-4 outline-none text-[15px] text-white transition-all resize-none shadow-inner focus:border-blue-500/30 max-h-40"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className="w-14 h-14 pb-1 mb-0.5 flex items-center justify-center bg-blue-600 text-white rounded-[1.5rem] hover:bg-blue-50 hover:text-blue-600 transition-all disabled:opacity-30 disabled:grayscale active:scale-90 shadow-2xl shadow-blue-600/40 group"
              >
                <Send size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
            </div>
          </footer>
        </div>
      </div>

      {/* Full Preview Modal */}
      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-white/10 p-3 rounded-full"><X size={32} /></button>
            <img src={fullPreviewUrl} alt="Full Preview" className="max-w-full max-h-full object-contain rounded-xl shadow-[0_0_100px_rgba(59,130,246,0.3)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
        .message-text { word-break: break-word; white-space: pre-wrap; }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

declare module "react" {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> { webkitdirectory?: string; directory?: string; }
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
