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
  Palette
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: string;
  sender: string;
  color?: string; // Preferred bubble color
  text?: string;
  file?: {
    name: string;
    type: string;
    data: any; // Blob, ArrayBuffer, or string
    size?: number;
  };
  timestamp: number;
  type?: "system";
  systemType?: "join" | "leave" | "error";
}

// Utility to get contrasting text color
function getContrastColor(hexColor: string) {
  // If no color, default to dark
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
  const [userColor, setUserColor] = useState<string>(localStorage.getItem("ppchat-color") || "#10b981");
  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Save settings
  useEffect(() => {
    if (username) localStorage.setItem("ppchat-username", username);
    localStorage.setItem("ppchat-color", userColor);
  }, [username, userColor]);

  const addMessage = (msg: Message) => {
    setMessages((prev) => {
      if (prev.find((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
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

    // If I am the host, I need to broadcast this to all other peers
    if (isHost) {
      setConnections(prev => {
        prev.forEach(conn => {
          if (conn.peer !== fromConn.peer) {
            conn.send(msg);
          }
        });
        return prev;
      });
    }
  };

  const setupPeer = (id?: string) => {
    setError(null);
    setIsConnecting(true);

    const newPeer = id ? new Peer(id) : new Peer();

    newPeer.on("open", (peerId) => {
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
      if (err.type === "unavailable-id") {
        setError("Room name busy. Try another or Join.");
      } else {
        setError(`Error: ${err.type}`);
      }
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
            text: `${username.trim() || "Anonymous"} joined`,
            timestamp: Date.now(),
            type: "system",
            systemType: "join",
          });
        });
        conn.on("data", (data) => handleReceivedData(data, conn));
        conn.on("error", () => { setError("Could not find room/host."); setIsConnecting(false); });
        conn.on("close", () => { setIsConnected(false); setCurrentRoom(null); });
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
      // Note: Data is sent as-is. PeerJS handles File/Blob/ArrayBuffer.
      const msg: Message = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: username.trim() || "Anonymous",
        color: userColor,
        file: {
          name: file.name,
          type: file.type || "application/octet-stream",
          data: file,
          size: file.size,
        },
        timestamp: Date.now(),
      };

      addMessage(msg);
      if (isHost) broadcast(msg); else connections[0]?.send(msg);
    }
    if (e.target) e.target.value = "";
  };

  const downloadFile = (fileData: any) => {
    const { name, data, type } = fileData;
    let blob: Blob;

    if (data instanceof Blob) {
      blob = data;
    } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      blob = new Blob([data], { type: type || 'application/octet-stream' });
    } else if (typeof data === "string" && data.startsWith("data:")) {
      const byteString = atob(data.split(",")[1]);
      const mimeString = data.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      blob = new Blob([ab], { type: mimeString });
    } else if (data && typeof data === 'object') {
      // In some cases PeerJS delivers data as an object representing parts of the file
      try {
        blob = new Blob([data], { type: type || 'application/octet-stream' });
      } catch (e) {
        console.error("Failed to construct blob:", e);
        alert("Download failed: Unexpected data format.");
        return;
      }
    } else {
      console.error("Invalid file data format:", typeof data, data);
      alert("Invalid file data format. Check the console.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLeaveRoom = () => { peer?.destroy(); window.location.reload(); };
  const copyRoomName = () => { navigator.clipboard.writeText(roomName); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const formatFileSize = (bytes: number = 0) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon size={20} className="text-blue-500" />;
    if (type.includes("video")) return <VideoIcon size={20} className="text-purple-500" />;
    return <FileIcon size={20} className="text-amber-500" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col items-center justify-center p-6 font-sans overflow-hidden relative">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm z-10">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[2rem] shadow-2xl p-6 overflow-hidden relative">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                <ShieldCheck size={28} />
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">PPChat</h1>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Identity</label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="text" placeholder="Username" value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 outline-none text-white text-sm"
                    />
                  </div>
                </div>
                <div className="w-16 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Color</label>
                  <div className="relative h-[42px]">
                    <input
                      type="color" value={userColor} onChange={(e) => setUserColor(e.target.value)}
                      className="w-full h-full bg-transparent border-none cursor-pointer rounded-xl overflow-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Room Name</label>
                <div className="relative group">
                  <Plus className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text" placeholder="e.g. secure-chat" value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 outline-none text-white text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="text-rose-400 text-[11px] font-bold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleJoinOrCreate("host")} disabled={isConnecting}
                  className="bg-white text-slate-900 py-4 rounded-2xl font-bold flex flex-col items-center gap-1 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 size={18} className="animate-spin" /> : <><Share2 size={20} /><span className="text-[9px] uppercase">Create</span></>}
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")} disabled={isConnecting}
                  className="bg-emerald-500 text-white py-4 rounded-2xl font-bold flex flex-col items-center gap-1 hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 size={18} className="animate-spin" /> : <><ChevronRight size={24} /><span className="text-[9px] uppercase">Join</span></>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0f172a] text-slate-200 flex flex-col font-sans overflow-hidden">
      <header className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800/50 px-6 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-sm leading-none">{currentRoom}</h2>
              <button onClick={copyRoomName} className="text-slate-500 hover:text-white transition-colors">
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">
              {isHost ? `Host (${connections.length})` : "P2P Active"}
            </p>
          </div>
        </div>

        <div className="flex-1 max-w-xs mx-8 hidden sm:flex items-center gap-3">
          <div className="relative flex-1 group">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-800/40 border border-slate-700/30 rounded-lg py-2 pl-9 pr-3 outline-none text-white text-xs focus:border-emerald-500/50 transition-all"
            />
          </div>
          <input
            type="color" value={userColor} onChange={(e) => setUserColor(e.target.value)}
            className="w-8 h-8 bg-transparent border-none cursor-pointer p-0 shrink-0"
          />
        </div>

        <button onClick={handleLeaveRoom} className="text-slate-400 hover:text-rose-400 transition-all p-2 hover:bg-rose-500/10 rounded-lg">
          <LogOut size={18} />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="hidden lg:flex w-72 border-r border-slate-800/50 bg-slate-900/30 flex-col">
          <div className="p-4 border-b border-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-500">Files</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {messages.filter(m => m.file).map((msg) => (
              <div key={msg.id} className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/30 flex items-center gap-3 hover:bg-slate-800 transition-all group">
                <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center shrink-0 border border-slate-700/50">{getFileIcon(msg.file!.type)}</div>
                <div className="flex-1 min-w-0 pr-1">
                  <p className="text-[11px] font-bold truncate text-slate-200">{msg.file?.name}</p>
                </div>
                <button onClick={() => downloadFile(msg.file)} className="text-emerald-500 hover:bg-emerald-500 hover:text-white p-1.5 rounded-lg transition-all"><Download size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#0f172a] relative">
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-4">
                    <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-800/50 text-slate-500 border border-slate-700/30">{msg.text}</span>
                  </div>
                );

                const isMe = msg.sender === (username.trim() || "Anonymous");
                const showSender = idx === 0 || messages[idx - 1].sender !== msg.sender || messages[idx - 1].type === "system";
                const bubbleColor = isMe ? userColor : (msg.color || "#334155");
                const textColor = getContrastColor(bubbleColor);

                return (
                  <div key={msg.id} className={cn("flex flex-col w-full animate-in fade-in slide-in-from-bottom-2 duration-300", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1 px-1">{msg.sender}</span>}

                    {msg.file && !msg.text ? (
                      <div className="bg-slate-800/60 border border-slate-700 p-3 rounded-2xl shadow-xl flex items-center gap-4 max-w-sm">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0 border border-slate-600/30">{getFileIcon(msg.file.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{msg.file.name}</p>
                          <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{formatFileSize(msg.file.size)}</p>
                        </div>
                        <button onClick={() => downloadFile(msg.file)} className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"><Download size={14} /></button>
                      </div>
                    ) : (
                      <div
                        style={{ backgroundColor: bubbleColor, color: textColor }}
                        className={cn("px-4 py-3 shadow-lg text-[14px] message-text leading-relaxed", isMe ? "rounded-[1.25rem] rounded-tr-none" : "rounded-[1.25rem] rounded-tl-none")}
                      >
                        {msg.text}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-4 border-t border-slate-800/50 bg-slate-900/40 backdrop-blur-xl">
            <div className="max-w-2xl mx-auto flex gap-3 items-end">
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all border border-slate-700/50"><Paperclip size={18} /></button>
                <button onClick={() => folderInputRef.current?.click()} className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all border border-slate-700/50"><FolderOpen size={18} /></button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} webkitdirectory="" directory="" className="hidden" />

              <textarea
                rows={1} placeholder="Message..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                className="flex-1 bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-2.5 outline-none text-sm text-white transition-all resize-none overflow-hidden"
              />
              <button onClick={sendMessage} disabled={!inputText.trim()} className="w-10 h-10 flex items-center justify-center bg-emerald-500 text-white rounded-xl hover:bg-emerald-400 transition-all disabled:opacity-30 active:scale-95 shadow-lg shadow-emerald-500/20"><Send size={18} /></button>
            </div>
          </footer>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .message-text { word-break: break-all; white-space: pre-wrap; }
      `}</style>
    </div>
  );
}

declare module "react" {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> { webkitdirectory?: string; directory?: string; }
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
